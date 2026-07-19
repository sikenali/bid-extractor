import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bid-extractor.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function uid() {
  return crypto.randomUUID();
}

export function initializeDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS extraction_rules (
    id TEXT PRIMARY KEY,
    field_name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    category TEXT DEFAULT 'regex',
    group_name TEXT DEFAULT 'info'
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS api_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    region TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS export_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    format TEXT DEFAULT 'docx',
    include_table_of_contents INTEGER DEFAULT 1,
    page_numbers INTEGER DEFAULT 1,
      header_footer INTEGER DEFAULT 1
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS theme_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    type TEXT DEFAULT 'parchment'
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS doc_results (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    result_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.exec(`INSERT OR IGNORE INTO export_settings (id) VALUES (1)`);
  db.exec(`INSERT OR IGNORE INTO theme_config (id) VALUES (1)`);

  const existingRules = (db.prepare('SELECT COUNT(*) as count FROM extraction_rules').get() as any).count;
  if (existingRules > 0) {
    // Dedup: keep lowest-id copy for each (field_name, category, group_name) tuple
    db.exec(`
      DELETE FROM extraction_rules WHERE id NOT IN (
        SELECT MIN(id) FROM extraction_rules GROUP BY field_name, category, group_name
      )
    `);
    return;
  }

  // ════════════════════════════════════════════
  // 项目信息 (info) — 项目基本字段
  // ════════════════════════════════════════════
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目名称',
    '(?:(?:项目|采购|工程|服务)\\s*(?:名称|内容|概述|概况)|招标内容|本次招标(?:内容|范围)|采购内容)[：:]?\\s*((?:(?!(?:项目|招标|采购)编号|招标方式|采购方式)[^\\n]){6,})',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目编号',
    '(?:(?:项目|招标|采购)\\s*(?:编号|编号)|(?:项目|招标|采购)号)[：:]?\\s*?([A-Za-z0-9]{2,20}[-_／/]?[A-Za-z0-9]{2,20}[-_／/]?[A-Za-z0-9]{0,20}|\\d{2,6}[-_]\\d{2,6}[-_][A-Za-z0-9]{2,10})',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标截止时间',
    '(?:(?:(?:投标|递交|提交)\\s*(?:投标|响应)?\\s*(?:文件)?\\s*(?:截止|递交|提交)\\s*(?:时间|日期|期限))|投标截止[时间]?|截标[时间]?|开标[时间]?|投标文件递交截止)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标地点',
    '(?:(?:(?:投标|开标|递交)\\s*(?:投标|响应)?\\s*(?:文件)?\\s*(?:地点|地址))){1}[：:]?\\s*([^\\n]+)',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交付时间',
    '(?:(?:交货|交付|供货|完工|完成|服务|合同履行|实施)\\s*(?:时间|期限|日期|周期)|(?:交货|交付|供货|工期)[：:]|合同履行期限)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)',
    'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交付时间',
    '(?:(?:交货|交付|供货|完工|完成|服务|合同履行|实施)\\s*(?:时间|期限|日期|周期)|(?:交货|交付|供货|工期)[：:]|合同履行期限)[：:]?\\s*([^\\n]{4,})',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交付地点',
    '(?:(?:交货|交付|供货)\\s*(?:地点|地址))[：:]?\\s*([^\\n]+)',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标保证金',
    '(?:(?:\\d[.、])?\\s*(?:投标)?\\s*保证金(?:金额|数)?(?:为|是)?[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*(?:(?:[\\d,]+(?:\\.[\\d]{2})?)|(?:[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+))\\s*(?:元|整|元整)?(?:（[¥￥]?[\\d,]+(?:\\.[\\d]{2})?元?）)?',
    'regex', 'info')`);

  // 额外多条目的保证金规则：数字在括号里、¥符号后、或纯数字后跟"元"
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标保证金',
    '[¥￥](\\d+(?:,\\d{3})*(?:\\.\\d{2})?)\\s*(?:元)?',
    'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标保证金',
    '(?:投标)?\\s*保证金[：:]?\\s*(?:人民币\\s*)?[¥￥]?(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)\\s*元',
    'regex', 'info')`);

  // 资金性质 / 采购方式 (辅助字段)
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购方式',
    '(?:采购|招标)\\s*(?:方式|形式)[：:]?\\s*([^\\n]{2,10})',
    'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '预算金额',
    '(?:(?:采购|项目|招标)\\s*)?(?:预算|最高限价|采购预算)[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{2})?)\\s*元',
    'regex', 'info')`);

  // ════════════════════════════════════════════
  // 商务条款 (business)
  // ════════════════════════════════════════════
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '付款方式',
    '(?:(?:付款|支付|结算)\\s*(?:方式|条件|办法|条款)|合同价款[^\\n]{0,4}支付)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质保期',
    '(?:(?:质保|保修|质量保证|免费保修)\\s*(?:期|期限|时间)|售后服务[^\\n]{0,4}期限|维保期)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '履约保证金',
    '(?:履约|合同履约)\\s*保证金[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交货期',
    '(?:(?:交货|交付|供货|完工|完成)\\s*(?:期|期限|周期)|合同履行期限)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标有效期',
    '(?:投标|报价)\\s*(?:有效)?\\s*(?:期|期限|有效期)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '合同签订',
    '(?:合同\\s*(?:签订|签署|签约|期限))[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  // --- 商务资质/资格类 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '营业执照',
    '(?:营业执照|工商营业执照|法人营业执照)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '民事责任',
    '(?:民事\\s*(?:责任|行为能力|权利能力)|独立\\s*(?:承担|享有))[：:]?\\s*([^\\n]{4,})',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '财务要求',
    '(?:(?:财务|会计)\\s*(?:制度|状况|报告|报表|审计)|审计\\s*报告)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '纳税要求',
    '(?:纳税|缴纳税收|税收\\s*(?:缴纳|记录|证明))[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '社会保障',
    '(?:社保|社会保障|社会保证|社会保险)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信用记录',
    '(?:(?:信用|诚信)\\s*(?:记录|查询|信息|中国)|信用中国|中国政府采购网|军队采购网|失信)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  // --- 声明/申明函 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '声明函',
    '(?:(?:声明|申明)\\s*函)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无违法记录',
    '(?:无\\s*(?:违法|重大违法|犯罪)\\s*(?:记录|行为)|(?:违法|犯罪)\\s*记录)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  // --- 关联关系 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '关联关系',
    '(?:直接控股|管理关系|控股\\s*(?:关系|管理))[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '联合体',
    '(?:联合体\\s*(?:投标|参与))[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分包转包',
    '(?:(?:分包|转包)[：:]?\\s*([^\\n]+)|不得\\s*(?:分包|转包)[^\\n]*)',
    'regex', 'business')`);

  // --- 中小企业 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '中小企业',
    '(?:(?:中小微|中小|小微|监狱|福利)\\s*企业|中小企业|小微企业)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  // --- 项目管理人员 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目管理人员',
    '(?:项目管理|监理|检测|项目负责人|项目经理)[：:]?\\s*([^\\n]+)',
    'regex', 'business')`);

  // --- 关键字检测 (段落级匹配) ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '失信被执行人', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '政府采购网', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '审计报告', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '会计报表', '', 'keyword', 'business')`);

  // ════════════════════════════════════════════
  // 技术条款 (tech)
  // ════════════════════════════════════════════
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术规格',
    '(?:技术\\s*(?:规格|参数|要求|指标|标准|需求))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '性能要求',
    '(?:性能\\s*(?:要求|指标|参数|需求))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '验收标准',
    '(?:(?:验收|测试|检验|检测)\\s*(?:标准|规范|要求|条件|依据|办法))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术指标',
    '(?:技术\\s*(?:指标|内容))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '服务内容',
    '(?:服务\\s*(?:内容|需求))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术参数',
    '(?:技术\\s*参数)[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '服务要求',
    '(?:服务\\s*(?:要求|标准|规范|内容|范围|需求))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '培训要求',
    '(?:培训\\s*(?:要求|内容|计划|方案))[：:]?\\s*([^\\n]+)',
    'regex', 'tech')`);

  // ════════════════════════════════════════════
  // 评分标准 (score)
  // ════════════════════════════════════════════
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评分表',
    '(?:评分\\s*(?:表|细则|标准|办法|规则|体系|因素))[：:]?\\s*([^\\n]+)',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评分项',
    '(?:(?:评分|评审|考核)\\s*项(?:目|?)：?\\s*|(\\d[.、]\\s*(?:人员|业绩|资质|方案|价格|技术|服务|商务)[^\\n]{0,20}?)(?:(?:(?:\\d{1,3})\\s*分|满分\\s*\\d{1,3}))',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '价格评分',
    '(?:(?:价格|报价)\\s*(?:评分|分值|得分|分)|价格部分)[：:]?\\s*([^\\n]+(?:分|\\d{1,3}\\s*分)?)',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术评分',
    '(?:技术\\s*(?:评分|分值|得分|分)|技术部分)[：:]?\\s*([^\\n]+(?:分|\\d{1,3}\\s*分)?)',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '商务评分',
    '(?:(?:商务|综合)\\s*(?:评分|分值|得分|分)|商务部分)[：:]?\\s*([^\\n]+(?:分|\\d{1,3}\\s*分)?)',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分值',
    '(?:(?:分\\s*值|分\\s*数|得\\s*分)[：:]?|(\\d{1,3})\\s*分)',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '满分',
    '(?:满分|总分)[：:]?\\s*(\\d{1,3}(?:\\.\\d)?)\\s*分',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '合格分数线',
    '(?:合格|及格|通过)\\s*(?:分数线|分数|分|线)[：:]?\\s*([^\\n]+)',
    'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评审因素',
    '(?:评审|评分|考核)\\s*(?:因素|内容|要点)[：:]?\\s*([^\\n]+)',
    'regex', 'score')`);

  // ════════════════════════════════════════════
  // 补充规则 — 常用招标词汇
  // ════════════════════════════════════════════
  // --- 项目信息补充 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购人', '(?:采购(?:人|单位|方)|招标(?:人|单位|方)|业主(?:单位)?|需求方)[：:]?\\s*([^\\n]+)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购代理', '(?:采购代理|招标代理|代理机构|招标机构)[：:]?\\s*([^\\n]+)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '资金来源', '(?:资金(?:来源|性质)|财政资金|自筹资金)[：:]?\\s*([^\\n]+)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '开标时间', '(?:开标(?:时间|日期)?)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '踏勘时间', '(?:踏勘|答疑|澄清|现场考察)[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}:\\d{2})?)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '踏勘时间', '(?:踏勘|答疑|澄清|现场考察)[：:]?\\s*([^\\n]{4,})', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分包情况', '(?:是否\\s*接受\\s*分包|分包\\s*(?:要求|情况|规定))[：:]?\\s*([^\\n]+)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '合同包号', '(?:合同包|包号|采购包)[：:]?\\s*([^\\n]+)', 'regex', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购需求', '(?:采购需求|项目需求|采购标的|采购内容)[：:]?\\s*([^\\n]+(?:货物|服务|工程|设备)[^\\n]*)', 'regex', 'info')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '面向中小微', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '节能环保', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '进口产品', '', 'keyword', 'info')`);

  // --- 商务条款补充 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '知识产权', '(?:知识产权|版权|专利权|商标权)[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保密要求', '(?:保密(?:义务|条款|要求|协议))[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '争议解决', '(?:争议(?:解决|处理)|仲裁|诉讼)[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '不可抗力', '(?:不可抗力)[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '违约责任', '(?:违约(?:责任|条款|金)|罚则)[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '付款进度', '(?:付款(?:比例|进度|节点)|分期(?:付款|支付))[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '发票要求', '(?:发票(?:要求|类型|开具))[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '验收条款', '(?:验收(?:条款|条件|标准|方式|办法))[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '售后服务', '(?:售后(?:服务|响应|支持|承诺)|服务响应)[：:]?\\s*([^\\n]+)', 'regex', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备品备件', '(?:备品备件|备件|配件|耗材)[：:]?\\s*([^\\n]+)', 'regex', 'business')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '合同解除', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '价格调整', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '出口管制', '', 'keyword', 'business')`);

  // --- 技术条款补充 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '功能要求', '(?:功能(?:要求|需求|说明|描述|配置))[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '配置清单', '(?:配置(?:清单|要求|列表|说明)|设备清单)[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安装调试', '(?:安装(?:要求|调试|地点|方式|条件))[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术方案', '(?:技术(?:方案|路线|架构|设计)|实施(?:方案|计划))[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安全要求', '(?:安全(?:要求|标准|等级|防护|保密)|信息安全)[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质量要求', '(?:质量(?:要求|标准|保证|控制)|品控)[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '软硬件要求', '(?:(?:软件|硬件|系统|平台|网络)\\s*(?:要求|环境|配置))[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '接口要求', '(?:接口(?:要求|规范|标准|协议)|数据(?:接口|对接|交换))[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术资料', '(?:技术(?:资料|文档|文件|图纸)|设计图纸)[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '运维要求', '(?:运维|维保|维护|运行维护)[：:]?\\s*([^\\n]+)', 'regex', 'tech')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '标准规范', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '兼容性', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国产化', '', 'keyword', 'tech')`);

  // --- 评分标准补充 ---
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评标办法', '(?:评标(?:办法|方法|方式)|综合评分法|最低评标价法)[：:]?\\s*([^\\n]+)', 'regex', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评分标准细则', '(?:评分(?:标准|细则|规则|依据))[：:]?\\s*([^\\n]+)', 'regex', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '价格扣除', '(?:价格(?:扣除|优惠|折扣|减除))[：:]?\\s*([^\\n]+)', 'regex', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '优先采购', '(?:优先(?:采购|选购)|强制(?:采购|选购))[：:]?\\s*([^\\n]+)', 'regex', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '客观分', '(?:客观(?:分|评分|分值)[：:]?\\s*([^\\n]+|\\d{1,3}\\s*分)', 'regex', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '主观分', '(?:主观(?:分|评分|分值)[：:]?\\s*([^\\n]+|\\d{1,3}\\s*分)', 'regex', 'score')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评标委员会', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '中小企业优惠', '', 'keyword', 'score')`);

  // ════════════════════════════════════════════
  // 关键字规则 — 用于文档章节检测
  // ════════════════════════════════════════════
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '废标', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无效投标', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '实质性响应', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '★号条款', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '否决投标', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '联合体投标', '', 'keyword', 'info')`);

  // ════════════════════════════════════════════
  // 项目信息类关键字 (Section 2) — 军工/军队专项扩展
  // ════════════════════════════════════════════
  // 2.1 项目基础标识
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标编号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '包件号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分包', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '标段', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '品目号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购计划编号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军品采购编号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备采购编号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '年度采购计划', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '立项批复文号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '预算文号', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购清单', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '货物清单', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '服务清单', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '工程范围', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '标的明细', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购数量', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '单位', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '控制价', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '财政资金', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备建设经费', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '科研试制经费', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '专项资金', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国拨经费', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '采购单位', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备采购管理部门', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '后勤保障单位', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目负责人', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '联审单位', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '监理单位', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '最终用户', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标代理机构', '', 'keyword', 'info')`);
  // 2.2 时间节点关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标公告发布时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标文件发售起止时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '文件获取截止时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '答疑截止时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '澄清截止时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '补遗发布时限', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标文件递交开始时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评标时间', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '公示期', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '中标公示期限', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质疑期限', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投诉期限', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '合同签订时限', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交付周期', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '完工工期', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '试运行周期', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质保周期', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '服务周期', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '履约期限', '', 'keyword', 'info')`);
  // 2.3 投标文件与平台流程关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '线上投标', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '线下递交', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电子投标文件', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '纸质正本', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '纸质副本', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '加密标书', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', 'CA数字证书', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '平台注册', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '供应商入库', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '准入审核', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '资质预审', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '资格预审', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '资格后审', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '现场答疑', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标文件澄清', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标文件补遗', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '变更公告', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '更正公告', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '重新招标', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '竞争性谈判', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '单一来源', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '询价采购', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '框架协议采购', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '集中采购', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '定点采购', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '批量采购', '', 'keyword', 'info')`);
  // 2.4 交付与地点信息
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安装地点', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目实施地点', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '部队驻场', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工厂区', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保密库房', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '运输目的地', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '到货验收地点', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '售后服务驻点', '', 'keyword', 'info')`);

  // ════════════════════════════════════════════
  // 商务条款类关键字 (Section 3) — 通用 + 军工军队专项
  // ════════════════════════════════════════════
  // 3.1 投标人主体资格通用关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '法定代表人身份证明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '法人授权', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分公司授权', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '联合体协议', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '联合体牵头方', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '股东股权结构', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无外资控股', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无境外参股声明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '经营年限', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '经营范围匹配', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '财务报表', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '资产负债率', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '银行资信证明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '授信额度', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '完税证明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '社保缴纳证明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '纳税信用等级', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '失信被执行人查询', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '经营异常查询', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '重大违法记录声明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '近三年无重大质量事故', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无行贿犯罪记录', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信用中国查询报告', '', 'keyword', 'business')`);
  // 3.2 军工/军队专属商务资质关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备承制单位资格证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备承制单位注册证书', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', 'A类承制单位', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', 'B类承制单位', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '武器装备科研生产单位保密资格证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '一级保密资质', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '二级保密资质', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '三级保密资质', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '武器装备科研生产许可证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工四证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国军标质量管理体系GJB9001C认证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '武器装备科研生产单位安全生产许可证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '非外资独资/控股/参股承诺书', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无境外资本声明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密人员备案', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保密委员会机构', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保密设备', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密载体管理', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工项目保密协议', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '脱密处理方案', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密业务隔离措施', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军代表对接机制', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军品配套资质', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '配套单位名录准入', '', 'keyword', 'business')`);
  // 3.3 财务与投标费用条款
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保证金金额', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保证金缴纳截止时间', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保证金退还时限', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质保保证金', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质量保证金', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '预付款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '进度款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '竣工结算款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '尾款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '付款节点', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '发票类型', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '增值税专用发票', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '免税军品发票', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '报价含税', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '报价不含税', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '运费单列', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保险费单列', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安装调试费单列', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '培训费单列', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备品备件费单列', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '招标文件工本费', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '平台服务费', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交易服务费', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电子开标服务费', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '公证费', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保函替代保证金', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '银行履约保函', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '见索即付保函', '', 'keyword', 'business')`);
  // 3.4 合同履约商务条款
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交货方式', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '送货上门', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '出厂检验', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军检', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军方验收', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '出厂合格证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '第三方检测报告', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '交付清单', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装箱单', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '原产地证明', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '海关报关', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '商检报告', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信用证支付', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '外汇结算', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '驻场服务', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '故障报修时限', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '上门维修时限', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备品备件储备', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备件供应周期', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '终身维修服务', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '软件升级服务', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '操作培训', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '运维培训', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军方人员专项培训', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '逾期交货违约金', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质量违约扣款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '单方解除合同', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '索赔条款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质保期延长条款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '知识产权侵权追责', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密泄露追责', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '仲裁管辖', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '法院管辖', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保密违约处罚', '', 'keyword', 'business')`);
  // 3.5 投标合规商务约束
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '否决性商务条款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无效投标情形', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '标书密封要求', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '签字盖章要求', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '骑缝章', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '每页签章', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '副本与正本一致性', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '文件有效期', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '报价有效期', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '不低于成本报价承诺', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '转包禁止条款', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '违法分包禁止', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分包单位报备', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分包资质要求', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '授权代理证书', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '原厂授权函', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '唯一授权', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '区域授权', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '售后服务承诺函', '', 'keyword', 'business')`);
  // 3.6 国际招标专属商务关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '进出口经营权', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '进出口备案登记表', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '海关备案', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '外币报价', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '汇率换算基准', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国际运输', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '海运保险', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '原产地证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '商会认证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '境外厂商授权', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '跨境质保', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '报关清关', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '关税增值税承担方', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国际信用证', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '延期付款保函', '', 'keyword', 'business')`);

  // ════════════════════════════════════════════
  // 技术条款类关键字 (Section 4) — 通用 + 军工专项
  // ════════════════════════════════════════════
  // 4.1 标准体系关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国标GB', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国军标GJB', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '航标HB', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '船标CB', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电科SJ', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '行标DL', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '企标', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '行业规范', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术规范书', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术规格书', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术协议', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '原厂技术手册', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '测试规范', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '验收规范', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '定型文件', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备定型批文', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '科研试验大纲', '', 'keyword', 'tech')`);
  // 4.2 军工五性核心关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '五性', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '五性分析报告', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '可靠性增长试验', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '故障修复时间MTTR', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '故障检测率', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '故障隔离率', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安全冗余设计', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电磁干扰抑制', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '静电防护ESD', '', 'keyword', 'tech')`);
  // 4.3 硬件类技术通用关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '设备型号', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '硬件参数', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '输入输出接口', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '精度', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '量程', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分辨率', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '响应时间', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '温湿度工作区间', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '防护等级IP', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '抗震', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '抗冲击', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '抗振动', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '宽温工作', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '防尘防水防腐蚀', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '模块化设计', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '兼容对接现有系统', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '接口协议匹配', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '硬件冗余', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备用机组', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备件清单', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '易损件清单', '', 'keyword', 'tech')`);
  // 4.4 软件/信息化技术关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '操作系统适配', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '数据库兼容', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '中间件适配', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '接口API', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '数据加密', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '数据脱敏', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密数据存储', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '等保测评', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信息安全分级保护', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密信息系统分级保护', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '源代码交付', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '源代码保密协议', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '功能模块清单', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '并发访问量', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '存储容量', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '带宽指标', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '运维监控平台', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '日志留存', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '数据备份机制', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '异地容灾', '', 'keyword', 'tech')`);
  // 4.5 军工涉密技术专项关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密信息处理', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '红黑隔离', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '单向导入设备', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密计算机专用', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无无线模块', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '物理隔离', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信息防泄露', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '数据销毁工具', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '介质粉碎销毁', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '加密算国产密SM2/SM3/SM4', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国密算法改造', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密系统安全测评', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '防木马', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '防远程控制', '', 'keyword', 'tech')`);
  // 4.6 试验、检验、验收技术关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '型式试验', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军方联试', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '现场联调', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '环境试验', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '盐雾', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '老化测试', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '抽样检测', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '验收测试方案', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '验收指标对照表', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术偏离表', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '正偏离', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '负偏离', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无偏离', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '★强制技术指标', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '功能演示', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '样机送检', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '样品试制', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '小批量试产', '', 'keyword', 'tech')`);
  // 4.7 工程/服务类技术关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '实施组织架构', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '施工工艺', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安全施工规范', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '工期管控方案', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '故障处置预案', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '部队应急保障预案', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术培训大纲', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术交底', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '图纸交付', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '竣工图纸', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术文档全套交付', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '操作手册', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '维护手册', '', 'keyword', 'tech')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '维修图纸', '', 'keyword', 'tech')`);

  // ════════════════════════════════════════════
  // 评分标准类关键字 (Section 5)
  // ════════════════════════════════════════════
  // 5.1 分值权重分类关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '权重占比', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '加分项', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '满分值', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '最低得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '有效得分区间', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '算术平均', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评标基准价', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '价格分计算公式', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '性价比评分法', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '经评审最低投标价法', '', 'keyword', 'score')`);
  // 5.2 商务评分关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工四证齐全加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保密资质等级加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国军标认证加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '财务状况评分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '净资产加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '银行资信加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '同类军工项目业绩', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '近三年军品供货业绩', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '合同金额分级加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '原厂授权得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '售后服务体系评分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '服务网点数量加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '质保期延长加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '无违法记录加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信用等级加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '本地化服务加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '驻场团队配置加分', '', 'keyword', 'score')`);
  // 5.3 技术评分关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术方案完整性得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '五性方案完整度', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电磁兼容方案得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国密/信息安全方案加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '指标全部满足基础分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '优于招标指标正偏离加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '核心指标负偏离扣分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '样机/样品质量得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '试验检测方案评分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '实施组织方案得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '应急保障方案得分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术团队人员资质', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工项目负责人', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术创新方案加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国产化替代方案加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '自主知识产权加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '软件著作权/专利加分', '', 'keyword', 'score')`);
  // 5.4 否决项（废标条款）关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '关键商务条款不满足否决投标', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '核心技术指标不满足直接废标', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '未提供必备资质证书', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '资质过期', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '授权无效', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '保证金未按时缴纳', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '投标有效期不满足', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '标书未签字盖章', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '报价高于最高限价', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '提供虚假资质', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '提供虚假业绩', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '提供虚假证书', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '外资控股不符合军工保密要求', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '未签署保密承诺书', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '技术方案存在重大缺陷', '', 'keyword', 'score')`);
  // 5.5 业绩、人员加分关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军方项目验收证明', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目获奖证书', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国防科技进步奖', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '高新技术企业', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '专精特新企业', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工配套定点单位', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '项目负责人军工从业年限', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '高级工程师', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密项目管理证书', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '特种作业人员持证', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '售后工程师团队规模', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '本地化驻场人员数量', '', 'keyword', 'score')`);
  // 5.6 价格评分专项关键字
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '有效投标报价', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '价格偏离率', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '备品备件报价合理性', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '运维服务报价合理性', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '分项报价完整性', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '漏项报价扣分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '缺漏分项清单扣分项', '', 'keyword', 'score')`);

  // ════════════════════════════════════════════
  // 附录：各平台专属特殊招标要求标识 (Section 6)
  // ════════════════════════════════════════════
  // 6.1 军队/军委平台
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备承制资格', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军代表验收', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军工保密承诺书', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '非外资声明', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军品定价机制', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '装备五性强制要求', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '涉密载体管控', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '部队现场保障', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军用标准强制符合性', '', 'keyword', 'info')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '军审财务资料', '', 'keyword', 'info')`);
  // 6.2 航天/船舶/兵器/电科军工央企平台
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '集团供应商库准入', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '配套单位名录', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '集团内部资质互认', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '国产化替代指标', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '集团级项目业绩加分', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '厂区保密进场管理', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '集团统一验收规范', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '型号项目配套资质', '', 'keyword', 'business')`);
  // 6.3 能源央企平台
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电力行业资质', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电力施工许可', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电力设备检测标准', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电网兼容指标', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '电力运维专项业绩', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '安全生产标准化证书', '', 'keyword', 'business')`);
  // 6.4 通用技术/国际招标平台
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '进出口资质', '', 'keyword', 'business')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '跨境运输', '', 'keyword', 'business')`);
  // 供货周期
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '供货周期', '(?:供货|交付|交货)(?:周期|期限|时间)[：:]?\\s*([^。\\n]{2,30})', 'regex', 'business')`);
  // 售后响应
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '售后响应', '(?:售后|服务)(?:响应|支持|要求)[：:]?\\s*([^。\\n]{2,60})', 'regex', 'business')`);
  // 6.5 第三方通用招投标平台
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '残疾人福利企业加分', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '节能产品', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '环保产品优先采购', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '信用分通用评价', '', 'keyword', 'score')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '政府采购框架协议', '', 'keyword', 'score')`);

  // 评标办法
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评标办法', '(?:评标办法|评审办法|评标方法)[：:]?\\s*([^。\\n]{2,60})', 'regex', 'score')`);
  // 评分表
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评分表', '(?:评分表|评审表)[：:]?\\s*([^。\\n]{2,100})', 'regex', 'score')`);
  // 评分项
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评分项', '(?:评分项|评审项|评分内容)[：:]?\\s*([^。\\n]{2,60})', 'regex', 'score')`);
  // 评分说明
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES ('${uid()}', '评分说明', '(?:评分说明|评审说明|评分依据)[：:]?\\s*([^。\\n]{2,100})', 'regex', 'score')`);

  db.exec(`INSERT INTO api_configs (id, provider, model, api_key) VALUES ('${uid()}', '阿里云', 'qwen-turbo', '')`);
  db.exec(`INSERT INTO api_configs (id, provider, model, api_key) VALUES ('${uid()}', '百度', 'ernie-bot', '')`);
  db.exec(`INSERT INTO api_configs (id, provider, model, api_key) VALUES ('${uid()}', '智谱', 'glm-4', '')`);
}

export { db };
