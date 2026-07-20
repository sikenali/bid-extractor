import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bid-extractor.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Migration version table ──────────────────────────────────────────
const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )
`;
db.exec(MIGRATION_TABLE_SQL);

let currentVersion = 0;
try {
  const row = db.prepare('SELECT MAX(version) as v FROM _migrations').get() as { v: number | null };
  currentVersion = row.v ?? 0;
} catch {
  // table might not exist yet, version stays 0
}

// ── Encryption module ────────────────────────────────────────────────
const ENC_KEY_FILE = path.join(dataDir, '.enc_key');

function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(32);
}

function loadOrGenerateKey(): Buffer {
  if (fs.existsSync(ENC_KEY_FILE)) {
    return fs.readFileSync(ENC_KEY_FILE);
  }
  const key = generateEncryptionKey();
  fs.writeFileSync(ENC_KEY_FILE, key, { mode: 0o600 });
  return key;
}

const encKey = loadOrGenerateKey();

export function encrypt(value: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

export function decrypt(encrypted: string): string {
  const [ivBase64, ciphertext] = encrypted.split(':');
  const iv = Buffer.from(ivBase64!, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
  let decrypted = decipher.update(ciphertext!, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 8, 12)) + key.slice(-4);
}

// ── Schema helpers ───────────────────────────────────────────────────
function tableExists(tableName: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName) as { cnt: number };
  return row.cnt > 0;
}

function columnExists(tableName: string, columnName: string): boolean {
  if (!tableExists(tableName)) return false;
  const row = db.prepare(
    `PRAGMA table_info(${tableName})`
  ).all() as Array<{ cid: number; name: string }>;
  return row.some(col => col.name === columnName);
}

// ── Initialization ───────────────────────────────────────────────────
export function initializeDatabase() {
  // Create tables if they don't exist
  if (!tableExists('extraction_rules')) {
    db.exec(`CREATE TABLE extraction_rules (
      id TEXT PRIMARY KEY,
      field_name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      category TEXT DEFAULT 'regex',
      group_name TEXT DEFAULT 'info'
    )`);
  }

  if (!tableExists('correction_history')) {
    db.exec(`CREATE TABLE correction_history (
      id TEXT PRIMARY KEY,
      field_name TEXT NOT NULL,
      original_value TEXT,
      corrected_value TEXT NOT NULL,
      paragraph_text TEXT,
      group_name TEXT DEFAULT 'info',
      file_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  if (!tableExists('api_configs')) {
    db.exec(`CREATE TABLE api_configs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT NOT NULL,
      region TEXT,
      base_url TEXT
    )`);
  } else {
    // Safely add base_url column only if it doesn't exist
    if (!columnExists('api_configs', 'base_url')) {
      db.exec(`ALTER TABLE api_configs ADD COLUMN base_url TEXT`);
    }
  }

  if (!tableExists('export_settings')) {
    db.exec(`CREATE TABLE export_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      format TEXT DEFAULT 'docx',
      include_table_of_contents INTEGER DEFAULT 1,
      page_numbers INTEGER DEFAULT 1,
      header_footer INTEGER DEFAULT 1
    )`);
  }

  if (!tableExists('theme_config')) {
    db.exec(`CREATE TABLE theme_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      type TEXT DEFAULT 'parchment'
    )`);
  }

  if (!tableExists('doc_results')) {
    db.exec(`CREATE TABLE doc_results (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  if (!tableExists('llm_enhance_settings')) {
    db.exec(`CREATE TABLE llm_enhance_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER DEFAULT 0,
      provider TEXT DEFAULT 'qwen-turbo',
      max_doc_chars INTEGER DEFAULT 32000,
      timeout_seconds INTEGER DEFAULT 60,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  // Seed default records
  const existingExport = db.prepare('SELECT id FROM export_settings WHERE id = 1').get() as { id: number } | undefined;
  if (!existingExport) {
    db.prepare('INSERT INTO export_settings (id) VALUES (?)').run(1);
  }

  const existingTheme = db.prepare('SELECT id FROM theme_config WHERE id = 1').get() as { id: number } | undefined;
  if (!existingTheme) {
    db.prepare('INSERT INTO theme_config (id) VALUES (?)').run(1);
  }

  const existingLlmSettings = db.prepare('SELECT id FROM llm_enhance_settings WHERE id = 1').get() as { id: number } | undefined;
  if (!existingLlmSettings) {
    db.prepare('INSERT INTO llm_enhance_settings (id) VALUES (?)').run(1);
  }

  // Seed default rules only if none exist yet
  const existingRules = (db.prepare('SELECT COUNT(*) as count FROM extraction_rules').get() as any).count;
  if (existingRules > 0) {
    return;
  }

  // Prepared statement for rule insertion — avoids string concatenation
  const insertRule = db.prepare(
    'INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)'
  );

  const seedRules: Array<[string, string, string, string, string]> = [
    // ════════════════════════════════════════════
    // 项目信息 (info)
    // ════════════════════════════════════════════
    ['info_project_name', '项目名称',
     '(?:(?:项目|采购|工程|服务)\\s*(?:名称|内容|概述|概况)|招标内容|本次招标(?:内容|范围)|采购内容)[：:]?\\s*((?:(?!(?:项目|招标|采购)编号|招标方式|采购方式)[^\\n]){6,})',
     'regex', 'info'],
    ['info_project_code', '项目编号',
     '(?:(?:项目|招标|采购)\\s*(?:编号|编号)|(?:项目|招标|采购)号)[：:]?\\s*?([A-Za-z0-9]{2,20}[-_／/]?[A-Za-z0-9]{2,20}[-_／/]?[A-Za-z0-9]{0,20}|\\d{2,6}[-_]\\d{2,6}[-_][A-Za-z0-9]{2,10})',
     'regex', 'info'],
    ['info_bid_deadline', '投标截止时间',
     '(?:(?:(?:投标|递交|提交)\\s*(?:投标|响应)?\\s*(?:文件)?\\s*(?:截止|递交|提交)\\s*(?:时间|日期|期限))|投标截止[时间]?|截标[时间]?|开标[时间]?|投标文件递交截止)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)',
     'regex', 'info'],
    ['info_bid_location', '投标地点',
     '(?:(?:(?:投标|开标|递交)\\s*(?:投标|响应)?\\s*(?:文件)?\\s*(?:地点|地址))){1}[：:]?\\s*([^\\n]+)',
     'regex', 'info'],
    ['info_delivery_time_1', '交付时间',
     '(?:(?:交货|交付|供货|完工|完成|服务|合同履行|实施)\\s*(?:时间|期限|日期|周期)|(?:交货|交付|供货|工期)[：:]|合同履行期限)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)',
     'regex', 'info'],
    ['info_delivery_time_2', '交付时间',
     '(?:(?:交货|交付|供货|完工|完成|服务|合同履行|实施)\\s*(?:时间|期限|日期|周期)|(?:交货|交付|供货|工期)[：:]|合同履行期限)[：:]?\\s*([^\\n]{4,})',
     'regex', 'info'],
    ['info_delivery_location', '交付地点',
     '(?:(?:交货|交付|供货)\\s*(?:地点|地址))[：:]?\\s*([^\\n]+)',
     'regex', 'info'],
    ['info_bid_bond_1', '投标保证金',
     '(?:(?:\\d[.、])?\\s*(?:投标)?\\s*保证金(?:金额|数)?(?:为|是)?[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*(?:(?:[\\d,]+(?:\\.[\\d]{2})?)|(?:[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+))\\s*(?:元|整|元整)?(?:（[¥￥]?[\\d,]+(?:\\.[\\d]{2})?元?）)?',
     'regex', 'info'],
    ['info_bid_bond_2', '投标保证金',
     '[¥￥](\\d+(?:,\\d{3})*(?:\\.\\d{2})?)\\s*(?:元)?',
     'regex', 'info'],
    ['info_bid_bond_3', '投标保证金',
     '(?:投标)?\\s*保证金[：:]?\\s*(?:人民币\\s*)?[¥￥]?(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)\\s*元',
     'regex', 'info'],
    ['info_procurement_method', '采购方式',
     '(?:采购|招标)\\s*(?:方式|形式)[：:]?\\s*([^\\n]{2,10})',
     'regex', 'info'],
    ['info_budget', '预算金额',
     '(?:(?:采购|项目|招标)\\s*)?(?:预算|最高限价|采购预算)[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)\\s*元',
     'regex', 'info'],
    // ════════════════════════════════════════════
    // 商务条款 (business)
    // ════════════════════════════════════════════
    ['business_payment', '付款方式',
     '(?:(?:付款|支付|结算)\\s*(?:方式|条件|办法|条款)|合同价款[^\\n]{0,4}支付)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_warranty', '质保期',
     '(?:(?:质保|保修|质量保证|免费保修)\\s*(?:期|期限|时间)|售后服务[^\\n]{0,4}期限|维保期)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_performance_bond', '履约保证金',
     '(?:履约|合同履约)\\s*保证金[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_delivery_period', '交货期',
     '(?:(?:交货|交付|供货|完工|完成)\\s*(?:期|期限|周期)|合同履行期限)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_bid_validity', '投标有效期',
     '(?:投标|报价)\\s*(?:有效)?\\s*(?:期|期限|有效期)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_contract_signing', '合同签订',
     '(?:合同\\s*(?:签订|签署|签约|期限))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_license', '营业执照',
     '(?:营业执照|工商营业执照|法人营业执照)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_civil_liability', '民事责任',
     '(?:民事\\s*(?:责任|行为能力|权利能力)|独立\\s*(?:承担|享有))[：:]?\\s*([^\\n]{4,})',
     'regex', 'business'],
    ['business_financial', '财务要求',
     '(?:(?:财务|会计)\\s*(?:制度|状况|报告|报表|审计)|审计\\s*报告)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_tax', '纳税要求',
     '(?:纳税|缴纳税收|税收\\s*(?:缴纳|记录|证明))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_social_security', '社会保障',
     '(?:社保|社会保障|社会保证|社会保险)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_credit', '信用记录',
     '(?:(?:信用|诚信)\\s*(?:记录|查询|信息|中国)|信用中国|中国政府采购网|军队采购网|失信)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_declaration', '声明函',
     '(?:(?:声明|申明)\\s*函)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_no_violation', '无违法记录',
     '(?:无\\s*(?:违法|重大违法|犯罪)\\s*(?:记录|行为)|(?:违法|犯罪)\\s*记录)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_affiliation', '关联关系',
     '(?:直接控股|管理关系|控股\\s*(?:关系|管理))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_consortium', '联合体',
     '(?:联合体\\s*(?:投标|参与))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_subcontracting', '分包转包',
     '(?:(?:分包|转包)[：:]?\\s*([^\\n]+)|不得\\s*(?:分包|转包)[^\\n]*)',
     'regex', 'business'],
    ['business_sme', '中小企业',
     '(?:(?:中小微|中小|小微|监狱|福利)\\s*企业|中小企业|小微企业)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_project_manager', '项目管理人员',
     '(?:项目管理|监理|检测|项目负责人|项目经理)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_keyword_insolvency', '失信被执行人', '', 'keyword', 'business'],
    ['business_keyword_govprocure', '政府采购网', '', 'keyword', 'business'],
    ['business_keyword_audit', '审计报告', '', 'keyword', 'business'],
    ['business_keyword_accounts', '会计报表', '', 'keyword', 'business'],
    // ════════════════════════════════════════════
    // 技术条款 (tech)
    // ════════════════════════════════════════════
    ['tech_spec', '技术规格',
     '(?:技术\\s*(?:规格|参数|要求|指标|标准|需求))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_perf', '性能要求',
     '(?:性能\\s*(?:要求|指标|参数|需求))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_acceptance', '验收标准',
     '(?:(?:验收|测试|检验|检测)\\s*(?:标准|规范|要求|条件|依据|办法))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_tech_indicator', '技术指标',
     '(?:技术\\s*(?:指标|内容))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_service_content', '服务内容',
     '(?:服务\\s*(?:内容|需求))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_tech_params', '技术参数',
     '(?:技术\\s*参数)[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_service_req', '服务要求',
     '(?:服务\\s*(?:要求|标准|规范|内容|范围|需求))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_training', '培训要求',
     '(?:培训\\s*(?:要求|内容|计划|方案))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    // ════════════════════════════════════════════
    // 评分标准 (score)
    // ════════════════════════════════════════════
    ['score_table', '评分表',
     '(?:评分\\s*(?:表|细则|标准|办法|规则|体系|因素))[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    ['score_item', '评分项',
     '(?:(?:评分|评审|考核)\\s*项(?:目|?)：?\\s*|(\\d[.、]\\s*(?:人员|业绩|资质|方案|价格|技术|服务|商务)[^\\n]{0,20}?)(?:(?:(?:\\d{1,3})\\s*分|满分\\s*\\d{1,3}))',
     'regex', 'score'],
    ['score_price', '价格评分',
     '(?:(?:价格|报价)\\s*(?:评分|分值|得分|分)|价格部分)[：:]?\\s*([^\\n]+(?:分|\\d{1,3}\\s*分)?)',
     'regex', 'score'],
    ['score_tech', '技术评分',
     '(?:技术\\s*(?:评分|分值|得分|分)|技术部分)[：:]?\\s*([^\\n]+(?:分|\\d{1,3}\\s*分)?)',
     'regex', 'score'],
    ['score_business', '商务评分',
     '(?:(?:商务|综合)\\s*(?:评分|分值|得分|分)|商务部分)[：:]?\\s*([^\\n]+(?:分|\\d{1,3}\\s*分)?)',
     'regex', 'score'],
    ['score_points', '分值',
     '(?:(?:分\\s*值|分\\s*数|得\\s*分)[：:]?|(\\d{1,3})\\s*分)',
     'regex', 'score'],
    ['score_full', '满分',
     '(?:满分|总分)[：:]?\\s*(\\d{1,3}(?:\\.\\d)?)\\s*分',
     'regex', 'score'],
    ['score_pass', '合格分数线',
     '(?:合格|及格|通过)\\s*(?:分数线|分数|分|线)[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    ['score_factors', '评审因素',
     '(?:评审|评分|考核)\\s*(?:因素|内容|要点)[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    // ════════════════════════════════════════════
    // 补充规则
    // ════════════════════════════════════════════
    ['info_purchaser', '采购人',
     '(?:采购(?:人|单位|方)|招标(?:人|单位|方)|业主(?:单位)?|需求方)[：:]?\\s*([^\\n]+)',
     'regex', 'info'],
    ['info_agent', '采购代理',
     '(?:采购代理|招标代理|代理机构|招标机构)[：:]?\\s*([^\\n]+)',
     'regex', 'info'],
    ['info_funding_source', '资金来源',
     '(?:资金(?:来源|性质)|财政资金|自筹资金)[：:]?\\s*([^\\n]+)',
     'regex', 'info'],
    ['info_open_time', '开标时间',
     '(?:开标(?:时间|日期)?)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)',
     'regex', 'info'],
    ['info_site_visit', '踏勘时间',
     '(?:踏勘|答疑|澄清|现场考察)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)',
     'regex', 'info'],
    ['info_site_visit_text', '踏勘时间',
     '(?:踏勘|答疑|澄清|现场考察)[：:]?\\s*([^\\n]{4,})',
     'regex', 'info'],
    ['info_subcontract', '分包情况',
     '(?:是否\\s*接受\\s*分包|分包\\s*(?:要求|情况|规定))[：:]?\\s*([^\\n]+)',
     'regex', 'info'],
    ['info_contract_package', '合同包号',
     '(?:合同包号|采购包号|包件号|合同包(?!号))[：:]?\\s*([^\\n]{2,30})',
     'regex', 'info'],
    ['info_procurement_need', '采购需求',
     '(?:采购需求|项目需求|采购标的|采购内容|项目概况)[：:]?\\s*([^。\\n]{4,200})',
     'regex', 'info'],
    ['info_keyword_sme', '面向中小微', '', 'keyword', 'info'],
    ['info_keyword_energy_save', '节能环保', '', 'keyword', 'info'],
    ['info_keyword_import', '进口产品', '', 'keyword', 'info'],
    // business supplements
    ['business_ip', '知识产权',
     '(?:知识产权|版权|专利权|商标权)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_confidentiality', '保密要求',
     '(?:保密(?:义务|条款|要求|协议))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_dispute', '争议解决',
     '(?:争议(?:解决|处理)|仲裁|诉讼)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_force_majeure', '不可抗力',
     '(?:不可抗力)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_breach', '违约责任',
     '(?:违约(?:责任|条款|金)|罚则)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_payment_schedule', '付款进度',
     '(?:付款(?:比例|进度|节点)|分期(?:付款|支付))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_invoice', '发票要求',
     '(?:发票(?:要求|类型|开具))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_acceptance_clause', '验收条款',
     '(?:验收(?:条款|条件|标准|方式|办法))[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_after_sales', '售后服务',
     '(?:售后(?:服务|响应|支持|承诺)|服务响应)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_spare_parts', '备品备件',
     '(?:备品备件|备件|配件|耗材)[：:]?\\s*([^\\n]+)',
     'regex', 'business'],
    ['business_keyword_contract_terminate', '合同解除', '', 'keyword', 'business'],
    ['business_keyword_price_adjust', '价格调整', '', 'keyword', 'business'],
    ['business_keyword_export_control', '出口管制', '', 'keyword', 'business'],
    // tech supplements
    ['tech_func_req', '功能要求',
     '(?:功能(?:要求|需求|说明|描述|配置))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_config', '配置清单',
     '(?:配置(?:清单|要求|列表|说明)|设备清单)[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_install', '安装调试',
     '(?:安装(?:要求|调试|地点|方式|条件))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_solution', '技术方案',
     '(?:技术(?:方案|路线|架构|设计)|实施(?:方案|计划))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_security_req', '安全要求',
     '(?:安全(?:要求|标准|等级|防护|保密)|信息安全)[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_quality_req', '质量要求',
     '(?:质量(?:要求|标准|保证|控制)|品控)[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_hw_sw', '软硬件要求',
     '(?:(?:软件|硬件|系统|平台|网络)\\s*(?:要求|环境|配置))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_interface', '接口要求',
     '(?:接口(?:要求|规范|标准|协议)|数据(?:接口|对接|交换))[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_tech_docs', '技术资料',
     '(?:技术(?:资料|文档|文件|图纸)|设计图纸)[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_ops', '运维要求',
     '(?:运维|维保|维护|运行维护)[：:]?\\s*([^\\n]+)',
     'regex', 'tech'],
    ['tech_keyword_standard', '标准规范', '', 'keyword', 'tech'],
    ['tech_keyword_compatible', '兼容性', '', 'keyword', 'tech'],
    ['tech_keyword_domestic', '国产化', '', 'keyword', 'tech'],
    // score supplements
    ['score_bidding_method', '评标办法',
     '(?:评标(?:办法|方法|方式)|综合评分法|最低评标价法)[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    ['score_detail', '评分标准细则',
     '(?:评分(?:标准|细则|规则|依据))[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    ['score_price_deduct', '价格扣除',
     '(?:价格(?:扣除|优惠|折扣|减除))[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    ['score_priority', '优先采购',
     '(?:优先(?:采购|选购)|强制(?:采购|选购))[：:]?\\s*([^\\n]+)',
     'regex', 'score'],
    ['score_objective', '客观分',
     '(?:客观(?:分|评分|分值)[：:]?\\s*([^\\n]+|\\d{1,3}\\s*分))',
     'regex', 'score'],
    ['score_subjective', '主观分',
     '(?:主观(?:分|评分|分值)[：:]?\\s*([^\\n]+|\\d{1,3}\\s*分))',
     'regex', 'score'],
    ['score_keyword_committee', '评标委员会', '', 'keyword', 'score'],
    ['score_keyword_sme_pref', '中小企业优惠', '', 'keyword', 'score'],
    // seal group
    ['seal_keyword_bid_seal', '废标', '', 'keyword', 'info'],
    ['seal_keyword_invalid_bid', '无效投标', '', 'keyword', 'info'],
    ['seal_keyword_substantial', '实质性响应', '', 'keyword', 'info'],
    ['seal_keyword_star_clause', '★号条款', '', 'keyword', 'info'],
    ['seal_keyword_reject', '否决投标', '', 'keyword', 'info'],
    ['seal_keyword_consortium', '联合体投标', '', 'keyword', 'info'],
    // info keywords section 2
    ['info_keyword_bidding_no', '招标编号', '', 'keyword', 'info'],
    ['info_keyword_package_no', '包件号', '', 'keyword', 'info'],
    ['info_keyword_subcontract', '分包', '', 'keyword', 'info'],
    ['info_keyword_section', '标段', '', 'keyword', 'info'],
    ['info_keyword_item_code', '品目号', '', 'keyword', 'info'],
    ['info_keyword_plan_no', '采购计划编号', '', 'keyword', 'info'],
    ['info_keyword_military_no', '军品采购编号', '', 'keyword', 'info'],
    ['info_keyword_equip_no', '装备采购编号', '', 'keyword', 'info'],
    ['info_keyword_annual_plan', '年度采购计划', '', 'keyword', 'info'],
    ['info_keyword_approval_doc', '立项批复文号', '', 'keyword', 'info'],
    ['info_keyword_budget_doc', '预算文号', '', 'keyword', 'info'],
    ['info_keyword_procurement_list', '采购清单', '', 'keyword', 'info'],
    ['info_keyword_goods_list', '货物清单', '', 'keyword', 'info'],
    ['info_keyword_service_list', '服务清单', '', 'keyword', 'info'],
    ['info_keyword_scope', '工程范围', '', 'keyword', 'info'],
    ['info_keyword_items_detail', '标的明细', '', 'keyword', 'info'],
    ['info_keyword_quantity', '采购数量', '', 'keyword', 'info'],
    ['info_keyword_unit', '单位', '', 'keyword', 'info'],
    ['info_keyword_control_price', '控制价', '', 'keyword', 'info'],
    ['info_keyword_fiscal', '财政资金', '', 'keyword', 'info'],
    ['info_keyword_equip_construction', '装备建设经费', '', 'keyword', 'info'],
    ['info_keyword_research_fund', '科研试制经费', '', 'keyword', 'info'],
    ['info_keyword_special_fund', '专项资金', '', 'keyword', 'info'],
    ['info_keyword_national_fund', '国拨经费', '', 'keyword', 'info'],
    ['info_keyword_buyer', '采购单位', '', 'keyword', 'info'],
    ['info_keyword_equip_mgmt', '装备采购管理部门', '', 'keyword', 'info'],
    ['info_keyword_logistics', '后勤保障单位', '', 'keyword', 'info'],
    ['info_keyword_pm', '项目负责人', '', 'keyword', 'info'],
    ['info_keyword_joint_review', '联审单位', '', 'keyword', 'info'],
    ['info_keyword_supervision', '监理单位', '', 'keyword', 'info'],
    ['info_keyword_end_user', '最终用户', '', 'keyword', 'info'],
    ['info_keyword_agency', '招标代理机构', '', 'keyword', 'info'],
    // time keywords
    ['info_keyword_announce_date', '招标公告发布时间', '', 'keyword', 'info'],
    ['info_keyword_sale_period', '招标文件发售起止时间', '', 'keyword', 'info'],
    ['info_keyword_fetch_deadline', '文件获取截止时间', '', 'keyword', 'info'],
    ['info_keyword_qa_deadline', '答疑截止时间', '', 'keyword', 'info'],
    ['info_keyword_clarify_deadline', '澄清截止时间', '', 'keyword', 'info'],
    ['info_keyword_supplement_limit', '补遗发布时限', '', 'keyword', 'info'],
    ['info_keyword_submit_start', '投标文件递交开始时间', '', 'keyword', 'info'],
    ['info_keyword_eval_time', '评标时间', '', 'keyword', 'info'],
    ['info_keyword_public_period', '公示期', '', 'keyword', 'info'],
    ['info_keyword_award_period', '中标公示期限', '', 'keyword', 'info'],
    ['info_keyword_challenge_period', '质疑期限', '', 'keyword', 'info'],
    ['info_keyword_complaint_period', '投诉期限', '', 'keyword', 'info'],
    ['info_keyword_contract_deadline', '合同签订时限', '', 'keyword', 'info'],
    ['info_keyword_delivery_cycle', '交付周期', '', 'keyword', 'info'],
    ['info_keyword_work_deadline', '完工工期', '', 'keyword', 'info'],
    ['info_keyword_trial_period', '试运行周期', '', 'keyword', 'info'],
    ['info_keyword_warranty_period', '质保周期', '', 'keyword', 'info'],
    ['info_keyword_service_cycle', '服务周期', '', 'keyword', 'info'],
    ['info_keyword_performance_period', '履约期限', '', 'keyword', 'info'],
    // process keywords
    ['info_keyword_online_bid', '线上投标', '', 'keyword', 'info'],
    ['info_keyword_offline_submit', '线下递交', '', 'keyword', 'info'],
    ['info_keyword_electronic_bid', '电子投标文件', '', 'keyword', 'info'],
    ['info_keyword_paper_original', '纸质正本', '', 'keyword', 'info'],
    ['info_keyword_paper_copy', '纸质副本', '', 'keyword', 'info'],
    ['info_keyword_encrypted_bid', '加密标书', '', 'keyword', 'info'],
    ['info_keyword_ca_cert', 'CA数字证书', '', 'keyword', 'info'],
    ['info_keyword_platform_reg', '平台注册', '', 'keyword', 'info'],
    ['info_keyword_supplier_pool', '供应商入库', '', 'keyword', 'info'],
    ['info_keyword_access_review', '准入审核', '', 'keyword', 'info'],
    ['info_keyword_qual_pre_review', '资质预审', '', 'keyword', 'info'],
    ['info_keyword_qual_pre_review2', '资格预审', '', 'keyword', 'info'],
    ['info_keyword_qual_post_review', '资格后审', '', 'keyword', 'info'],
    ['info_keyword_onsite_qa', '现场答疑', '', 'keyword', 'info'],
    ['info_keyword_clarification', '招标文件澄清', '', 'keyword', 'info'],
    ['info_keyword_supplement', '招标文件补遗', '', 'keyword', 'info'],
    ['info_keyword_change_notice', '变更公告', '', 'keyword', 'info'],
    ['info_keyword_correction_notice', '更正公告', '', 'keyword', 'info'],
    ['info_keyword_rebid', '重新招标', '', 'keyword', 'info'],
    ['info_keyword_negotiation', '竞争性谈判', '', 'keyword', 'info'],
    ['info_keyword_single_source', '单一来源', '', 'keyword', 'info'],
    ['info_keyword_inquiry', '询价采购', '', 'keyword', 'info'],
    ['info_keyword_framework', '框架协议采购', '', 'keyword', 'info'],
    ['info_keyword_centralized', '集中采购', '', 'keyword', 'info'],
    ['info_keyword_fixed_point', '定点采购', '', 'keyword', 'info'],
    ['info_keyword_batch_purchase', '批量采购', '', 'keyword', 'info'],
    // delivery/location
    ['info_keyword_install_loc', '安装地点', '', 'keyword', 'info'],
    ['info_keyword_impl_loc', '项目实施地点', '', 'keyword', 'info'],
    ['info_keyword_military_station', '部队驻场', '', 'keyword', 'info'],
    ['info_keyword_military_factory', '军工厂区', '', 'keyword', 'info'],
    ['info_keyword_secret_room', '保密库房', '', 'keyword', 'info'],
    ['info_keyword_transport_dest', '运输目的地', '', 'keyword', 'info'],
    ['info_keyword_accept_loc', '到货验收地点', '', 'keyword', 'info'],
    ['info_keyword_support_point', '售后服务驻点', '', 'keyword', 'info'],
    // business section 3
    ['business_keyword_legal_rep', '法定代表人身份证明', '', 'keyword', 'business'],
    ['business_keyword_authorization', '法人授权', '', 'keyword', 'business'],
    ['business_keyword_branch_auth', '分公司授权', '', 'keyword', 'business'],
    ['business_keyword_consortium_agreement', '联合体协议', '', 'keyword', 'business'],
    ['business_keyword_consortium_lead', '联合体牵头方', '', 'keyword', 'business'],
    ['business_keyword_shareholding', '股东股权结构', '', 'keyword', 'business'],
    ['business_keyword_no_foreign_hold', '无外资控股', '', 'keyword', 'business'],
    ['business_keyword_no_foreign参股', '无境外参股声明', '', 'keyword', 'business'],
    ['business_keyword_oper_years', '经营年限', '', 'keyword', 'business'],
    ['business_keyword_scope_match', '经营范围匹配', '', 'keyword', 'business'],
    ['business_keyword_financial_stmt', '财务报表', '', 'keyword', 'business'],
    ['business_keyword_debt_ratio', '资产负债率', '', 'keyword', 'business'],
    ['business_keyword_bank_credit', '银行资信证明', '', 'keyword', 'business'],
    ['business_keyword_credit_line', '授信额度', '', 'keyword', 'business'],
    ['business_keyword_tax_paid', '完税证明', '', 'keyword', 'business'],
    ['business_keyword_social_pay', '社保缴纳证明', '', 'keyword', 'business'],
    ['business_keyword_tax_credit', '纳税信用等级', '', 'keyword', 'business'],
    ['business_keyword_credit_check', '失信被执行人查询', '', 'keyword', 'business'],
    ['business_keyword_abnormal_check', '经营异常查询', '', 'keyword', 'business'],
    ['business_keyword_no_violation_stmt', '重大违法记录声明', '', 'keyword', 'business'],
    ['business_keyword_no_quality_issue', '近三年无重大质量事故', '', 'keyword', 'business'],
    ['business_keyword_no_bribery', '无行贿犯罪记录', '', 'keyword', 'business'],
    ['business_keyword_credit_report', '信用中国查询报告', '', 'keyword', 'business'],
    // military business keywords
    ['business_keyword_equip_cert', '装备承制单位资格证', '', 'keyword', 'business'],
    ['business_keyword_equip_reg', '装备承制单位注册证书', '', 'keyword', 'business'],
    ['business_keyword_class_a', 'A类承制单位', '', 'keyword', 'business'],
    ['business_keyword_class_b', 'B类承制单位', '', 'keyword', 'business'],
    ['business_keyword_confidentiality_cert', '武器装备科研生产单位保密资格证', '', 'keyword', 'business'],
    ['business_keyword_level_1', '一级保密资质', '', 'keyword', 'business'],
    ['business_keyword_level_2', '二级保密资质', '', 'keyword', 'business'],
    ['business_keyword_level_3', '三级保密资质', '', 'keyword', 'business'],
    ['business_keyword_research_prod_license', '武器装备科研生产许可证', '', 'keyword', 'business'],
    ['business_keyword_four_certs', '军工四证', '', 'keyword', 'business'],
    ['business_keyword_gjb_cert', '国军标质量管理体系GJB9001C认证', '', 'keyword', 'business'],
    ['business_keyword_safety_license', '武器装备科研生产单位安全生产许可证', '', 'keyword', 'business'],
    ['business_keyword_non_foreign_commit', '非外资独资/控股/参股承诺书', '', 'keyword', 'business'],
    ['business_keyword_no_foreign_capital', '无境外资本声明', '', 'keyword', 'business'],
    ['business_keyword_confidential_personnel', '涉密人员备案', '', 'keyword', 'business'],
    ['business_keyword_confidential_committee', '保密委员会机构', '', 'keyword', 'business'],
    ['business_keyword_confidential_equipment', '保密设备', '', 'keyword', 'business'],
    ['business_keyword_confidential_media', '涉密载体管理', '', 'keyword', 'business'],
    ['business_keyword_project_confidentiality', '军工项目保密协议', '', 'keyword', 'business'],
    ['business_keyword_declassification', '脱密处理方案', '', 'keyword', 'business'],
    ['business_keyword_isolation', '涉密业务隔离措施', '', 'keyword', 'business'],
    ['business_keyword_rep_mechanism', '军代表对接机制', '', 'keyword', 'business'],
    ['business_keyword_equip_matching', '军品配套资质', '', 'keyword', 'business'],
    ['business_keyword_supplier_list', '配套单位名录准入', '', 'keyword', 'business'],
    // financial keywords
    ['business_keyword_deposit_amount', '保证金金额', '', 'keyword', 'business'],
    ['business_keyword_deposit_deadline', '保证金缴纳截止时间', '', 'keyword', 'business'],
    ['business_keyword_deposit_return', '保证金退还时限', '', 'keyword', 'business'],
    ['business_keyword_warranty_deposit', '质保保证金', '', 'keyword', 'business'],
    ['business_keyword_quality_deposit', '质量保证金', '', 'keyword', 'business'],
    ['business_keyword_advance', '预付款', '', 'keyword', 'business'],
    ['business_keyword_progress', '进度款', '', 'keyword', 'business'],
    ['business_keyword_completion_settlement', '竣工结算款', '', 'keyword', 'business'],
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((rows: typeof seedRules) => {
    for (const row of rows) {
      insert.run(...row);
    }
  });

  insertMany(seedRules);

  // Seed API configs
  const insertApiKey = db.prepare(
    'INSERT OR IGNORE INTO api_configs (id, provider, model, api_key) VALUES (?, ?, ?, ?)'
  );
  insertApiKey.run(crypto.randomUUID(), '阿里云', 'qwen-turbo', '');
  insertApiKey.run(crypto.randomUUID(), '百度', 'ernie-bot', '');
  insertApiKey.run(crypto.randomUUID(), '智谱', 'glm-4', '');

  // Mark initialization as done
  db.prepare('INSERT OR IGNORE INTO _migrations (version) VALUES (?)').run(1);
  db.prepare('INSERT OR IGNORE INTO _migrations (version) VALUES (?)').run(2);
}

export { db };
