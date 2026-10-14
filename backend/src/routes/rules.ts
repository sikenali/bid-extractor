import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { load } from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsPath = path.join(__dirname, '..', '..', 'data', 'skills.json');

interface SkillMeta {
  name: string;
  description: string;
  group: string;
  type: 'rules' | 'prompt';
  fields: string[];
  content?: string;
  importedAt: string;
  enabled?: boolean;
  // 本技能实际插入的 extraction_rules.id（导入/同步时记录），删除时精确清理，避免误删同名核心规则
  ruleIds?: string[];
}

function readSkills(): SkillMeta[] {
  try {
    if (fs.existsSync(skillsPath)) {
      return JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function writeSkills(skills: SkillMeta[]) {
  const dir = path.dirname(skillsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(skillsPath, JSON.stringify(skills, null, 2));
}

const localSkillsDir = path.join(__dirname, '..', '..', 'data', 'skills');
// 随包发布的种子技能目录（低代码技能文件载体）；启动时同步到 data/skills
const seedSkillsDir = path.join(__dirname, '..', '..', 'seed-skills');

function isSkillFile(f: string): boolean {
  return /\.(md|yaml|yml)$/i.test(f);
}

// 启动时确保本地技能目录可用；为空则从种子目录复制示例技能（由 index.ts 调用）
export function bootEnsureSeedSkills(): number {
  try {
    if (!fs.existsSync(localSkillsDir)) fs.mkdirSync(localSkillsDir, { recursive: true });
    if (!fs.existsSync(seedSkillsDir)) return 0;
    const existing = fs.readdirSync(localSkillsDir).filter(isSkillFile);
    if (existing.length > 0) return 0;
    const seeds = fs.readdirSync(seedSkillsDir).filter(isSkillFile);
    for (const f of seeds) {
      fs.copyFileSync(path.join(seedSkillsDir, f), path.join(localSkillsDir, f));
    }
    return seeds.length;
  } catch (err) {
    console.error('[boot] ensure seed skills failed:', err);
    return 0;
  }
}


interface SkillParseResult {
  name: string;
  description: string;
  group: string;
  type: 'rules' | 'prompt';
  fields: string[];
  content?: string;
  inserted: number;
  insertedIds: string[];
  skipped: string[];
}

function parseSkillContent(content: string, filename: string): SkillParseResult {
  const nameFromFile = filename.replace(/\.(md|yaml|yml)$/i, '');
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

  // Plain markdown prompt — store as prompt skill
  if (!fmMatch) {
    return {
      name: nameFromFile,
      description: content.split('\n')[0]?.replace(/^#\s*/, '') || nameFromFile,
      group: 'info',
      type: 'prompt',
      fields: [],
      content,
      inserted: 0,
      insertedIds: [],
      skipped: [],
    };
  }

  const fm = load(fmMatch[1]) as any;

  // YAML but no rules array — also store as prompt
  if (!fm || !Array.isArray(fm.rules)) {
    return {
      name: nameFromFile,
      description: fm?.description || nameFromFile,
      group: fm?.group || 'info',
      type: 'prompt',
      fields: [],
      content: content.replace(/^---[\s\S]*?---\n*/, ''),
      inserted: 0,
      insertedIds: [],
      skipped: [],
    };
  }

  const name = fm.name || nameFromFile;
  const defaultGroup = fm.group || 'info';
  const existing = db.prepare('SELECT field_name, group_name FROM extraction_rules').all() as any[];
  const existingSet = new Set(existing.map((r: any) => `${r.field_name}|${r.group_name}`));

  const allFields: string[] = [];
  const skipped: string[] = [];
  const insertedIds: string[] = [];
  let inserted = 0;

  for (const rule of fm.rules) {
    if (!rule.field) continue;
    const group = rule.group || defaultGroup;
    const category = rule.type === 'regex' ? 'regex' : 'keyword';
    const pattern = rule.pattern || '';
    const key = `${rule.field}|${group}`;
    allFields.push(rule.field);

    if (existingSet.has(key)) {
      skipped.push(rule.field);
      continue;
    }

    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)`)
      .run(id, rule.field, pattern, category, group);
    inserted++;
    insertedIds.push(id);
    existingSet.add(key);
  }

  return {
    name,
    description: fm.description || '',
    group: defaultGroup,
    type: 'rules',
    fields: allFields,
    inserted,
    insertedIds,
    skipped,
  };
}

function saveSkillMeta(meta: SkillMeta): boolean {
  const skills = readSkills();
  const existing = skills.findIndex(s => s.name === meta.name);
  const isUpdate = existing >= 0;
  if (isUpdate) {
    // 同名覆盖时合并 ruleIds：重复同步不再插入，但首轮插入的规则归属不能丢
    const prevIds = skills[existing].ruleIds || [];
    meta.ruleIds = [...new Set([...prevIds, ...(meta.ruleIds || [])])];
    skills[existing] = meta;
  } else {
    skills.push(meta);
  }
  writeSkills(skills);
  return isUpdate;
}

function deleteSkillRules(skill: SkillMeta): void {
  // 只删除本技能实际插入的规则（ruleIds），绝不按组+字段匹配删除——
  // 后者会误删与技能同名的核心规则（已验证的线上事故位）。
  // 老版本元数据无 ruleIds：仅清理元数据，不碰规则。
  if (!skill.ruleIds || skill.ruleIds.length === 0) return;
  db.prepare('DELETE FROM extraction_rules WHERE id IN (' +
    skill.ruleIds.map(() => '?').join(',') + ')').run(...skill.ruleIds);
}

const router = Router();


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 * 1024 * 1024 } });

function mapRule(r: any) {
  return {
    id: r.id,
    fieldName: r.field_name,
    pattern: r.pattern,
    enabled: r.enabled,
    category: r.category,
    groupName: r.group_name,
    aliasFor: r.alias_for || '',
  };
}

router.get('/', (req, res) => {
  const group = req.query.group as string | undefined;
  let rules;
  if (group) {
    rules = db.prepare('SELECT * FROM extraction_rules WHERE group_name = ? ORDER BY field_name').all(group);
  } else {
    rules = db.prepare('SELECT * FROM extraction_rules ORDER BY field_name').all();
  }
  res.json((rules as any[]).map(mapRule));
});

router.post('/', (req, res) => {
  const { fieldName, pattern, category, groupName, aliasFor } = req.body;
  const alias = aliasFor && aliasFor !== fieldName ? aliasFor : '';
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name, alias_for) VALUES (?, ?, ?, ?, ?, ?)`).run(id, fieldName, pattern || '', category || 'regex', groupName || 'info', alias);
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(id);
  res.status(201).json(mapRule(rule as any));
});

router.put('/:id', (req, res) => {
  const { fieldName, pattern, enabled, category, groupName, aliasFor } = req.body;
  const alias = aliasFor && aliasFor !== fieldName ? aliasFor : '';
  db.prepare(`UPDATE extraction_rules SET field_name=?, pattern=?, enabled=?, category=?, group_name=?, alias_for=? WHERE id=?`).run(fieldName, pattern ?? '', enabled ?? 1, category ?? 'regex', groupName ?? 'info', alias, req.params.id);
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(req.params.id);
  res.json(mapRule(rule as any));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM extraction_rules WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});


// List all imported skills with their rules
router.get('/skills', (req, res) => {
  const skills = readSkills();
  const allRules = db.prepare('SELECT * FROM extraction_rules').all() as any[];
  const result = skills.map(skill => {
    if (skill.type === 'prompt') {
      return { ...skill, rules: [] };
    }
    const rules = allRules
      .filter(r => skill.fields.includes(r.field_name) && r.group_name === skill.group)
      .map(mapRule);
    return { ...skill, rules };
  });
  res.json(result);
});

// Update a skill (toggle enabled / rename / edit description)
router.put('/skills/:name', (req, res) => {
  const skills = readSkills();
  const idx = skills.findIndex(s => s.name === req.params.name);
  if (idx < 0) { res.status(404).json({ error: 'Skill not found' }); return; }
  const { enabled, name, description } = req.body;
  if (typeof enabled === 'boolean') skills[idx].enabled = enabled;
  else if (enabled === 0 || enabled === 1) skills[idx].enabled = enabled === 1;
  if (typeof name === 'string' && name.trim()) skills[idx].name = name.trim();
  if (typeof description === 'string') skills[idx].description = description;
  writeSkills(skills);
  res.json(skills[idx]);
});

// Delete a skill and its rules
router.delete('/skills/:name', (req, res) => {
  const skills = readSkills();
  const idx = skills.findIndex(s => s.name === req.params.name);
  if (idx < 0) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  const skill = skills[idx];
  deleteSkillRules(skill);
  skills.splice(idx, 1);
  writeSkills(skills);
  res.json({ deleted: true });
});

// Import rules from a skill.md file (YAML frontmatter) or plain markdown prompt
router.post('/import-skill', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const content = req.file.buffer.toString('utf-8');
    const result = parseSkillContent(content, req.file.originalname);
    const meta: SkillMeta = {
      name: result.name,
      description: result.description,
      group: result.group,
      type: result.type,
      fields: result.fields,
      content: result.content,
      ruleIds: result.insertedIds,
      importedAt: new Date().toISOString(),
    };
    const isUpdate = saveSkillMeta(meta);
    res.json({
      name: meta.name,
      description: meta.description,
      group: meta.group,
      type: meta.type,
      inserted: result.inserted,
      skipped: result.skipped,
      count: result.inserted,
      isUpdate,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse skill file: ${err.message}` });
  }
});

// Sync skills from local directory (backend/data/skills/*.md)
router.post('/sync-skills', (_req, res) => {
  try {
    if (!fs.existsSync(localSkillsDir)) {
      fs.mkdirSync(localSkillsDir, { recursive: true });
    }
    bootEnsureSeedSkills();
    const files = fs.readdirSync(localSkillsDir).filter(isSkillFile);
    if (files.length === 0) {
      res.json({ synced: 0, skills: [], message: '本地没有可同步的技能文件，可先使用「导入技能」上传 .md / .yaml 文件' });
      return;
    }
    const results: any[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(localSkillsDir, file), 'utf-8');
      const result = parseSkillContent(content, file);
      const meta: SkillMeta = {
        name: result.name,
        description: result.description,
        group: result.group,
        type: result.type,
        fields: result.fields,
        content: result.content,
        ruleIds: result.insertedIds,
        importedAt: new Date().toISOString(),
      };
      saveSkillMeta(meta);
      results.push({
        file,
        name: result.name,
        type: result.type,
        inserted: result.inserted,
        skipped: result.skipped.length,
      });
    }
    res.json({ synced: results.length, skills: results });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to sync skills: ${err.message}` });
  }
});

// Save a correction and auto-generate a rule
router.post('/corrections', (req, res) => {
  const { fieldName, originalValue, correctedValue, paragraphText, groupName, fileName } = req.body;
  if (!fieldName || !correctedValue) {
    res.status(400).json({ error: 'fieldName and correctedValue required' });
    return;
  }

  const g = groupName || 'info';

  // Record correction
  db.prepare(`INSERT INTO correction_history (id, field_name, original_value, corrected_value, paragraph_text, group_name, file_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), fieldName, originalValue || '', correctedValue, paragraphText || '', g, fileName || '');

  // Auto-generate or update keyword rule
  const existing = db.prepare('SELECT id FROM extraction_rules WHERE field_name = ? AND group_name = ? AND category = ?')
    .get(fieldName, g, 'keyword') as any;

  if (!existing) {
    db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
      VALUES (?, ?, '', 'keyword', ?, 1)`)
      .run(crypto.randomUUID(), fieldName, g);
  }

  // If paragraph text is available and contains the field name, try to generate a regex pattern
  if (paragraphText && paragraphText.includes(fieldName)) {
    const idx = paragraphText.indexOf(fieldName);
    const after = paragraphText.substring(idx + fieldName.length).trim();
    if (after.startsWith('：') || after.startsWith(':')) {
      const existingRegex = db.prepare('SELECT id FROM extraction_rules WHERE field_name = ? AND group_name = ? AND category = ?')
        .get(fieldName, g, 'regex') as any;
      if (!existingRegex) {
        // Escape the corrected value for regex
        const escapedVal = correctedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = `(?:${fieldName})[：:]?\\s*(${escapedVal})`;
        db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name, enabled)
          VALUES (?, ?, ?, 'regex', ?, 1)`)
          .run(crypto.randomUUID(), fieldName, pattern, g);
      }
    }
  }

  res.json({ saved: true, fieldName, group: g });
});

// 与结果页 sidebar 六类表格字段一一对应（标星为动态项，不 seeding）
const SEED_CORE_RULES: Array<{ id: string; field: string; group: string; aliasFor?: string }> = [
  { id: 'sd_9fb07c10', field: '项目名称', group: 'info' },
  { id: 'sd_8e6bc3d9', field: '项目编号', group: 'info' },
  { id: 'sd_0ba733a0', field: '招标编号', group: 'info' },
  { id: 'sd_519d4559', field: '采购方式', group: 'info' },
  { id: 'sd_05418245', field: '预算金额', group: 'info' },
  { id: 'sd_880482eb', field: '投标截止时间', group: 'info' },
  { id: 'sd_b5a30a25', field: '开标时间', group: 'info' },
  { id: 'sd_7b639a92', field: '投标地点', group: 'info' },
  { id: 'sd_eee4c1d8', field: '交付时间', group: 'info' },
  { id: 'sd_48ba78ab', field: '交付地点', group: 'info' },
  { id: 'sd_44b7860a', field: '投标保证金', group: 'info' },
  { id: 'sd_9c568ae2', field: '采购人', group: 'info' },
  { id: 'sd_183fd775', field: '采购代理', group: 'info' },
  { id: 'sd_89feba1e', field: '资金来源', group: 'info' },
  { id: 'sd_6c388e37', field: '采购需求', group: 'info' },
  { id: 'sd_9682d809', field: '踏勘时间', group: 'info' },
  { id: 'sd_03788e00', field: '分包情况', group: 'info' },
  { id: 'sd_ea37f033', field: '合同包号', group: 'info' },
  { id: 'sd_4a9433fc', field: '面向中小微', group: 'info' },
  { id: 'sd_811ebd42', field: '付款方式', group: 'business' },
  { id: 'sd_e0f66ca1', field: '质保期', group: 'business' },
  { id: 'sd_5686bdb7', field: '履约保证金', group: 'business' },
  { id: 'sd_5620c69f', field: '交货期', group: 'business' },
  { id: 'sd_7b7ac7cf', field: '投标有效期', group: 'business' },
  { id: 'sd_d680beb7', field: '合同签订', group: 'business' },
  { id: 'sd_d3b5d0e5', field: '营业执照', group: 'business' },
  { id: 'sd_44ae5713', field: '财务要求', group: 'business' },
  { id: 'sd_dbfbd208', field: '纳税要求', group: 'business' },
  { id: 'sd_b669d70b', field: '社会保障', group: 'business' },
  { id: 'sd_2e3c8b17', field: '信用记录', group: 'business' },
  { id: 'sd_65bbc91f', field: '声明函', group: 'business' },
  { id: 'sd_62746644', field: '无违法记录', group: 'business' },
  { id: 'sd_46971d8f', field: '联合体', group: 'business' },
  { id: 'sd_e193dfab', field: '分包转包', group: 'business' },
  { id: 'sd_769ccba0', field: '中小企业', group: 'business' },
  { id: 'sd_fbb15b47', field: '项目管理人员', group: 'business' },
  { id: 'sd_e6cb2494', field: '知识产权', group: 'business' },
  { id: 'sd_e13a7026', field: '保密要求', group: 'business' },
  { id: 'sd_8586cf87', field: '争议解决', group: 'business' },
  { id: 'sd_2a610867', field: '违约责任', group: 'business' },
  { id: 'sd_654ad29a', field: '付款进度', group: 'business' },
  { id: 'sd_d1a22cfa', field: '发票要求', group: 'business' },
  { id: 'sd_0ecd5007', field: '验收条款', group: 'business' },
  { id: 'sd_6172f809', field: '售后服务', group: 'business' },
  { id: 'sd_bbce0b5d', field: '售后响应', group: 'business' },
  { id: 'sd_3f19eafc', field: '技术规格', group: 'tech' },
  { id: 'sd_b3c4c6ce', field: '性能要求', group: 'tech' },
  { id: 'sd_77a7d435', field: '验收标准', group: 'tech' },
  { id: 'sd_8276651a', field: '技术指标', group: 'tech' },
  { id: 'sd_0b825db5', field: '服务内容', group: 'tech' },
  { id: 'sd_118aa7ba', field: '技术参数', group: 'tech' },
  { id: 'sd_c51f3c3b', field: '服务要求', group: 'tech' },
  { id: 'sd_e850e4e7', field: '培训要求', group: 'tech' },
  { id: 'sd_0e34d6e5', field: '功能要求', group: 'tech' },
  { id: 'sd_971f6d07', field: '配置清单', group: 'tech' },
  { id: 'sd_a55ae6c6', field: '安装调试', group: 'tech' },
  { id: 'sd_4479c03f', field: '技术方案', group: 'tech' },
  { id: 'sd_5e13329c', field: '安全要求', group: 'tech' },
  { id: 'sd_2d3f3684', field: '安全保密要求', group: 'tech' },
  { id: 'sd_c8265003', field: '质量要求', group: 'tech' },
  { id: 'sd_b540fcc0', field: '软硬件要求', group: 'tech' },
  { id: 'sd_ce2cf541', field: '接口要求', group: 'tech' },
  { id: 'sd_938b0ac9', field: '技术资料', group: 'tech' },
  { id: 'sd_19315c80', field: '运维要求', group: 'tech' },
  { id: 'sd_e53db4bd', field: '交付成果', group: 'tech' },
  { id: 'sd_231d7f2f', field: '测试报告', group: 'tech' },
  { id: 'sd_d58ddd78', field: '测试环境', group: 'tech' },
  { id: 'sd_867449d9', field: '测量指标', group: 'tech' },
  { id: 'sd_a3a5228e', field: '部署要求', group: 'tech' },
  { id: 'sd_42d3e62b', field: '项目范围', group: 'tech' },
  { id: 'sd_552d234b', field: '方案要求', group: 'tech' },
  { id: 'sd_2c826cff', field: '实施要求', group: 'tech' },
  { id: 'sd_b79e97d2', field: '产品要求', group: 'tech' },
  { id: 'sd_dd7e9c8e', field: '设备要求', group: 'tech' },
  { id: 'sd_f842dcf5', field: '系统要求', group: 'tech' },
  { id: 'sd_52da9230', field: '软件要求', group: 'tech' },
  { id: 'sd_3ed4c903', field: '硬件要求', group: 'tech' },
  { id: 'sd_4b99d65b', field: '评标办法', group: 'score' },
  { id: 'sd_fe006cca', field: '评分标准', group: 'score' },
  { id: 'sd_f840e80e', field: '评分细则', group: 'score' },
  { id: 'sd_512c057a', field: '综合评分', group: 'score' },
  { id: 'sd_c3c6c9b3', field: '评分因素', group: 'score' },
  { id: 'sd_e8dcecc2', field: '商务评分', group: 'score' },
  { id: 'sd_a2fc9479', field: '技术评分', group: 'score' },
  { id: 'sd_17e990f6', field: '价格评分', group: 'score' },
  { id: 'sd_7845b3dd', field: '技术得分', group: 'score' },
  { id: 'sd_ac4d9b23', field: '商务得分', group: 'score' },
  { id: 'sd_55652474', field: '价格得分', group: 'score' },
  { id: 'sd_1b7f2b5d', field: '评审标准', group: 'score' },
  { id: 'sd_63ba3b16', field: '分值分配', group: 'score' },
  { id: 'sd_1843d0bd', field: '商务权重', group: 'score' },
  { id: 'sd_4db473a8', field: '技术权重', group: 'score' },
  { id: 'sd_45a30ef6', field: '价格权重', group: 'score' },
  { id: 'sd_ee726b65', field: '评分权重', group: 'score' },
  { id: 'sd_49132909', field: '满分值', group: 'score' },
  { id: 'sd_6281730e', field: '合格分', group: 'score' },
  { id: 'sd_fed7fd95', field: '评审因素', group: 'score' },
  { id: 'sd_78366b4c', field: '评分占比', group: 'score' },
  { id: 'sd_1c8e9464', field: '得分占比', group: 'score' },
  { id: 'sd_f94e0868', field: '评分值', group: 'score' },
  { id: 'sd_eaed339f', field: '评分项', group: 'score' },
  { id: 'sd_3fd57b7d', field: '密封要求', group: 'seal' },
  { id: 'sd_c1e6c1c2', field: '封标要求', group: 'seal' },
  { id: 'sd_d3395ca2', field: '封装方式', group: 'seal' },
  { id: 'sd_da18c59f', field: '正本要求', group: 'seal' },
  { id: 'sd_869514db', field: '正本数量', group: 'seal' },
  { id: 'sd_33a7e92c', field: '副本要求', group: 'seal' },
  { id: 'sd_920c8692', field: '副本数量', group: 'seal' },
  { id: 'sd_e13e46a7', field: '电子文件', group: 'seal' },
  { id: 'sd_b27e2e3a', field: '递交方式', group: 'seal' },
  { id: 'sd_31fa6342', field: '密封袋标识', group: 'seal' },
  { id: 'sd_654c6537', field: '密封章', group: 'seal' },
  { id: 'sd_1c365dd0', field: '密封处', group: 'seal' },
  { id: 'al_1a9dd73b', field: '招标名称', group: 'info', aliasFor: '项目名称' },
  { id: 'al_68ee830f', field: '投标名称', group: 'info', aliasFor: '项目名称' },
  { id: 'al_6acc7f9a', field: '工程名称', group: 'info', aliasFor: '项目名称' },
  { id: 'al_0ba733a0', field: '招标编号', group: 'info', aliasFor: '项目编号' },
  { id: 'al_9a0d43a3', field: '采购编号', group: 'info', aliasFor: '项目编号' },
  { id: 'al_649e9f13', field: '最高限价', group: 'info', aliasFor: '预算金额' },
  { id: 'al_9225ce1d', field: '招标控制价', group: 'info', aliasFor: '预算金额' },
  { id: 'al_caed01db', field: '递交截止时间', group: 'info', aliasFor: '投标截止时间' },
  { id: 'al_19d5dd93', field: '履约担保', group: 'business', aliasFor: '履约保证金' },
  { id: 'al_6468ea52', field: '支付方式', group: 'business', aliasFor: '付款方式' },
  { id: 'al_8bd8df4d', field: '付款条件', group: 'business', aliasFor: '付款方式' },
  { id: 'al_ac6eb025', field: '质量保证期', group: 'business', aliasFor: '质保期' },
  { id: 'al_f522b8df', field: '保修期', group: 'business', aliasFor: '质保期' },
  { id: 'al_c61331ed', field: '验收要求', group: 'tech', aliasFor: '验收标准' },
  { id: 'al_8b1af1d8', field: '售后保障', group: 'tech', aliasFor: '售后服务' },
  { id: 'al_71ae7740', field: '参数要求', group: 'tech', aliasFor: '技术参数' },
  { id: 'al_ac227da1', field: '性能指标', group: 'tech', aliasFor: '性能要求' },
  { id: 'al_93d9ed95', field: '评标标准', group: 'score', aliasFor: '评分标准' },
  { id: 'al_8dfe245a', field: '商务标评分', group: 'score', aliasFor: '商务评分' },
  { id: 'al_8472391e', field: '价格分', group: 'score', aliasFor: '价格评分' },
  { id: 'al_2179188e', field: '报价得分', group: 'score', aliasFor: '价格评分' },
  { id: 'al_e33e253c', field: '正本文件', group: 'seal', aliasFor: '正本' },
  { id: 'al_da5c9359', field: '副本文件', group: 'seal', aliasFor: '副本' },
  { id: 'al_ce994ef4', field: '密封方式', group: 'seal', aliasFor: '密封要求' },
  { id: 'al_00af2838', field: '电子投标文件', group: 'seal', aliasFor: '电子文件' },
  { id: 'al_abaf796c', field: '送达方式', group: 'seal', aliasFor: '递交方式' },
  { id: 'st_67c561c4', field: '★', group: 'star' },
  { id: 'st_6280633b', field: '▲', group: 'star' },
  { id: 'st_f34e02ae', field: '●', group: 'star' },
  { id: 'st_b5b9c814', field: '◆', group: 'star' },
  { id: 'st_8f629c13', field: '※', group: 'star' },
  { id: 'st_3093de0e', field: '*', group: 'star' },
];

// 六分类关键字段的正则表达式（补充规则正则式描述，供精确提取使用）
const REGEX_PATTERNS: Record<string, { group: string; pattern: string }> = {
  '项目名称': { group: 'info', pattern: '(?:(?:项目|采购|工程|服务)\\s*(?:名称|内容|概述|概况)|招标内容|本次招标(?:内容|范围)|采购内容)[：:]?\\s*((?:(?!(?:项目|招标|采购)编号|招标方式|采购方式)[^\\n]){6,})' },
  '项目编号': { group: 'info', pattern: '(?:项目|采购|招标|工程)(?:编号|编号ID|No.)[：:]?\\s*([A-Za-z0-9][A-Za-z0-9\\-_/．.]{3,40})' },
  '采购方式': { group: 'info', pattern: '(?:采购|招标)\\s*方式[：:]?\\s*([^，。\\n；;]{2,20})' },
  '预算金额': { group: 'info', pattern: '(?:(?:采购|项目|招标)\\s*)?(?:预算(?:金额)?|最高限价|招标控制价|采购预算)[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?(?:万)?)\\s*(?:万元|万|元)?' },
  '投标截止时间': { group: 'info', pattern: '(?:投标|递交|应标)(?:文件)?(?:递交)?(?:截止)?时间[：:]?\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日(?:\\s*\\d{1,2}[时:：]\\d{2}[分]?)?)' },
  '开标时间': { group: 'info', pattern: '(?:开标|解密)时间[：:]?\\s*(.{0,40}?(?:年|月|日|时|分).{0,20})' },
  '投标地点': { group: 'info', pattern: '(?:投标|递交|开标)地点[：:]?\\s*((?!http|www|网址|平台)[^，。\\n；;]{4,80})' },
  '交付时间': { group: 'info', pattern: '(?:交付|交货)(?:时间|期限)?[：:]?\\s*(.{0,30}?(?:年|月|日|天|个工作日).{0,20})' },
  '交付地点': { group: 'info', pattern: '(?:交付|交货|供货)地点[：:]?\\s*([^，。\\n；;]{4,60})' },
  '投标保证金': { group: 'info', pattern: '(?:投标)?保证金[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*([^，。\\n；;]{2,40})' },
  '采购人': { group: 'info', pattern: '(?:采购人|招标人|业主单位|采购单位|项目单位)[：:]?\\s*([^，。\\n；;]{4,40})' },
  '采购代理': { group: 'info', pattern: '(?:采购|招标)代理(?:机构)?[：:]?\\s*([^，。\\n；;]{4,40})' },
  '资金来源': { group: 'info', pattern: '资金(?:来源|性质)[：:]?\\s*([^，。\\n；;]{2,30})' },

  '付款方式': { group: 'business', pattern: '(?:付款|支付)(?:方式|条件)?[：:]?\\s*([^，。\\n；;]{4,40})' },
  '质保期': { group: 'business', pattern: '(?:质保期|质量保证期|保修期|质保期限)[：:]?\\s*([^，。\\n；;]{2,30})' },
  '履约保证金': { group: 'business', pattern: '(?:履约)?保证金[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*([^，。\\n；;]{2,40})' },
  '交货期': { group: 'business', pattern: '(?:交货期|交货时间|供货期|交付期)[：:]?\\s*([^，。\\n；;]{2,30})' },
  '投标有效期': { group: 'business', pattern: '(?:投标)?有效期[：:]?\\s*([^，。\\n；;]{2,30})' },
  '联合体': { group: 'business', pattern: '(?:是否接受|接受|允许)?联合体(?:投标)?[：:]?\\s*([^，。\\n；;]{2,40})' },
  '售后服务': { group: 'business', pattern: '(?:售后)?服务(?:期|内容|要求)?[：:]?\\s*([^，。\\n；;]{4,40})' },
  '履约保证金金额': { group: 'business', pattern: '履约保证金[：:]?\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?)\\s*元?' },

  '技术规格': { group: 'tech', pattern: '技术规格[：:]?\\s*([^，。\\n；;]{4,60})' },
  '技术指标': { group: 'tech', pattern: '技术指标[：:]?\\s*([^，。\\n；;]{4,60})' },
  '技术参数': { group: 'tech', pattern: '技术参数[：:]?\\s*([^，。\\n；;]{4,60})' },
  '验收标准': { group: 'tech', pattern: '验收标准[：:]?\\s*([^，。\\n；;]{4,60})' },
  '性能要求': { group: 'tech', pattern: '性能要求[：:]?\\s*([^，。\\n；;]{4,60})' },
  // 功能要求：匹配 ▲ 号条款中的功能描述
  '功能要求': { group: 'tech', pattern: '(?:功能|服务|系统)(?:要求|需求|规范)[：:]?\\s*([^\\n]{4,120})' },
  // 配置清单
  '配置清单': { group: 'tech', pattern: '(?:配置|设备|材料)(?:清单|列表|明细)[：:]?\\s*([^\\n]{4,80})' },
  // 安装调试
  '安装调试': { group: 'tech', pattern: '(?:安装|部署|调试)(?:要求|内容|工作)[：:]?\\s*([^\\n]{4,100})' },
  // 质量要求
  '质量要求': { group: 'tech', pattern: '质量(?:要求|标准|保证)[：:]?\\s*([^，。\\n；;]{4,60})|保证[^\\n]{0,20}(?:软件|系统|数据|代码)[^\\n]{0,60}(?:漏洞|病毒|安全)[^\\n]{0,40}' },
  // 接口要求
  '接口要求': { group: 'tech', pattern: '(?:接口|数据交换|协议|通信)(?:要求|规范|标准)[：:]?\\s*([^\\n]{4,100})' },
  // 安全保密
  '安全保密要求': { group: 'tech', pattern: '(?:安全|保密)(?:要求|规范|标准|等级|资质|认证)[：:]?\\s*([^\\n]{4,100})' },
  // 交付成果
  '交付成果': { group: 'tech', pattern: '(?:交付|提交|提供)(?:成果|文件|资料|源码|手册)[：:]?\\s*([^\\n]{4,120})|(?:源码|安装包|手册|文档)[：:]?\\s*([^\\n]{4,80})' },
  // 部署要求
  '部署要求': { group: 'tech', pattern: '(?:部署|安装|环境)(?:要求|配置|条件)[：:]?\\s*([^\\n]{4,100})' },
  // 方案要求
  '方案要求': { group: 'tech', pattern: '(?:方案|实施计划)[：:]?\\s*([^\\n]{4,100})' },
  // 测试环境 / 测量指标
  '测试环境': { group: 'tech', pattern: '(?:测试|环境)(?:环境|要求)[：:]?\\s*([^\\n]{4,80})' },
  '测量指标': { group: 'tech', pattern: '(?:测量|检测|测试)(?:指标|要求|项目)[：:]?\\s*([^\\n]{4,100})' },
  // 标准规范 / 兼容性 / 国产化
  '标准规范': { group: 'tech', pattern: '(?:标准|规范|协议)[：:]?\\s*([^\\n]{4,80})' },
  '兼容性': { group: 'tech', pattern: '兼容(?:性|要求)[：:]?\\s*([^\\n]{4,80})' },
  '国产化': { group: 'tech', pattern: '(?:国产|自主可控|国产化)[：:]?\\s*([^\\n]{4,80})' },

  '评标办法': { group: 'score', pattern: '评标办法[：:]?\\s*([^，。\\n；;]{2,40})' },
  '评分标准': { group: 'score', pattern: '评分标准[：:]?\\s*([^，。\\n；;]{2,40})' },
  '价格评分': { group: 'score', pattern: '(?:价格)(?:\\s*(?:评分|得分|部分|权重))?[^\\n]{0,10}(\\d+(?:\\.\\d+)?)\\s*分?' },
  '技术评分': { group: 'score', pattern: '(?:技术)(?:\\s*(?:评分|得分|部分|权重))?[^\\n]{0,10}(\\d+(?:\\.\\d+)?)\\s*分?' },
  '商务评分': { group: 'score', pattern: '(?:商务)(?:\\s*(?:评分|得分|部分|权重))?[^\\n]{0,10}(\\d+(?:\\.\\d+)?)\\s*分?' },
  '满分值': { group: 'score', pattern: '满分(?:值)?[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*分' },
  '价格得分': { group: 'score', pattern: '价格(?:得)?分[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分|)' },
  '商务得分': { group: 'score', pattern: '商务(?:得)?分[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分|)' },
  '技术得分': { group: 'score', pattern: '技术(?:得)?分[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:分|)' },
  // 评分项：精确匹配 "X. XXX项目" 或 "序号 + 评审分项" 格式
  '评分项': { group: 'score', pattern: '(?:评审分项|评分项)[：:]?\\s*([^\\n]{2,60})|^(?:\\d+[.、]\\s*)?(?:人员|业绩|资质|方案|价格|技术|服务|商务|响应|偏离)[^\\n]{0,30}' },
  // 评审因素 / 评分标准细则
  '评审因素': { group: 'score', pattern: '(?:评审|评分|考核)\\s*(?:因素|内容|要点)[：:]?\\s*([^\\n]{4,80})' },
  '评分标准细则': { group: 'score', pattern: '细则[：:]?\\s*([^\\n]{4,80})' },
  '综合评分': { group: 'score', pattern: '综合评分[法]?[：:]?\\s*([^\\n]{4,60})' },
  // 评分权重
  '商务权重': { group: 'score', pattern: '商务[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*分' },
  '技术权重': { group: 'score', pattern: '技术[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*分' },
  '价格权重': { group: 'score', pattern: '价格[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*分' },
  '分值分配': { group: 'score', pattern: '(?:分值|得分)[分配分布][：:]?\\s*([^\\n]{4,80})' },
  // 评分表
  '评分表': { group: 'score', pattern: '(?:评分表|附表\\d*)[：:]?\\s*([^\\n]{2,60})' },

  '密封要求': { group: 'seal', pattern: '密封[要求要]|密封[装|入|于|并][^\\n]{0,60}(?:正本|副本|封套)' },
  '正本数量': { group: 'seal', pattern: '正本[^\\n]{0,15}(\\d+)\\s*份' },
  '副本数量': { group: 'seal', pattern: '副本[^\\n]{0,15}(\\d+)\\s*份' },
  '封标要求': { group: 'seal', pattern: '封[包包]要[求求]|密封[标记][：:]?\\s*([^\\n]{4,80})' },
  '封装方式': { group: 'seal', pattern: '(?:封装|密封)方式[：:]?\\s*([^\\n]{4,60})' },
  '递交方式': { group: 'seal', pattern: '(?:递交|提交|发送)[方式式][：:]?\\s*([^\\n]{4,60})|(?:线上|电子|平台|现场)[^\\n]{0,40}(?:递交|提交)' },
  '密封章': { group: 'seal', pattern: '盖章[：:]?\\s*([^\\n]{4,40})' },
  '密封处': { group: 'seal', pattern: '(?:签章|签字|盖章)[处位][：:]?\\s*([^\\n]{4,40})' },

  // 商务补充
  '保密要求': { group: 'business', pattern: '保密[义务条款要求协议][：:]?\\s*([^\\n]{4,80})' },
  '发票要求': { group: 'business', pattern: '发票[要求类型开具][：:]?\\s*([^\\n]{4,80})' },
  '售后响应': { group: 'business', pattern: '响应[时间期限][：:]?\\s*([^\\n]{4,60})|出现[问题时问]投标人应及时响应[^\\n]{0,60}' },

  // 信息补充
  '分包情况': { group: 'info', pattern: '(?:是否\\s*接受\\s*分包|分包[要求情况规定])[：:]?\\s*([^\\n]{4,60})' },
  '合同包号': { group: 'info', pattern: '(?:合同包号|采购包号|包件号)[：:]?\\s*([^\\n]{2,30})' },
};

function applyRegexPatterns(): number {
  let updated = 0;
  // 不覆盖 title_first 类型规则（保留标题兜底逻辑）
  const stmt = db.prepare('UPDATE extraction_rules SET pattern = ?, category = ? WHERE field_name = ? AND group_name = ? AND category != ?');
  for (const [field, cfg] of Object.entries(REGEX_PATTERNS)) {
    const r = stmt.run(cfg.pattern, 'regex', field, cfg.group, 'title_first');
    if (r.changes > 0) updated++;
  }
  return updated;
}

// Reset all extraction rules to seed defaults
router.post('/reset', (_req, res) => {
  const existing = new Set(
    (db.prepare('SELECT field_name, group_name FROM extraction_rules').all() as any[])
      .map(r => `${r.field_name}|${r.group_name}`),
  );
  const stmt = db.prepare('INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, alias_for) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run('info_project_name', '项目名称',
    '(?:(?:项目|采购|工程|服务)\\s*(?:名称|内容|概述|概况)|招标内容|本次招标(?:内容|范围)|采购内容)[：:]?\\s*((?:(?!(?:项目|招标|采购)编号|招标方式|采购方式)[^\\n]){6,})',
    'regex', 'info', '');
  let added = 0;
  for (const s of SEED_CORE_RULES) {
    if (existing.has(`${s.field}|${s.group}`)) continue;
    const r = stmt.run(s.id, s.field, '', 'keyword', s.group, (s as any).aliasFor || '');
    if (r.changes > 0) added++;
  }
  applyRegexPatterns();
  res.json({ ok: true, added });
});

// 启动时自动补齐既有规则的正则表达式（由 index.ts 在 initializeDatabase() 后调用）
export function bootApplyRegexPatterns(): number {
  return applyRegexPatterns();
}

// Reset skills to empty (user-imported skills only, including their rules)
router.post('/reset-skills', (_req, res) => {
  const skills = readSkills();
  for (const skill of skills) deleteSkillRules(skill);
  writeSkills([]);
  res.json({ ok: true });
});

// Seed universal extraction rules (works across all document types)
const UNIVERSAL_RULES: Array<[string, string, string, string, string]> = [
  // ── 日期时间 ─────────────────────────────────────────────────────
  ['univ_date_1', '日期', '^(\\d{4}[年-/]\\d{1,2}[月-/]\\d{1,2})', 'regex', 'info'],
  ['univ_date_2', '日期', '^(\\d{4}[-.]\\d{1,2}[-.]\\d{1,2})', 'regex', 'info'],
  ['univ_datetime', '时间', '^(\\d{1,2}[:：]\\d{2}(?:[:：]\\d{2})?)', 'regex', 'info'],
  ['univ_period', '期限/周期', '(\\d{1,3}\\s*(?:年|月|日|天|个?工作日|周))', 'regex', 'info'],
  // ── 金额/数量 ────────────────────────────────────────────────────
  ['univ_amount', '金额', '[¥￥\\s]*(\\d[\\d,\\.]*\\s*(?:万|亿|元|块|圆|美元|USD|EUR)?)', 'regex', 'info'],
  ['univ_number', '数量/份数', '(\\d{1,3}(?:,\\d{3})*\\s*(?:份|套|本|册|台|件|项|个|人|套))', 'regex', 'info'],
  ['univ_percentage', '比例/百分比', '(\\d{1,3}(?:\\.\\d+)?\\s*%)', 'regex', 'info'],
  // ── 编号/编码 ────────────────────────────────────────────────────
  ['univ_code_id', '编号/代码', '([A-Z]{2,8}-?\\d[\\w-]{4,30}|\\d{8,}(?:[-_/]\\d+)*)', 'regex', 'info'],
  ['univ_doc_no', '文号/单号', '(?:文号|单号|编号|No\\.?|号)[：:]\\s*([A-Za-z0-9-_/．.]{3,40})', 'regex', 'info'],
  // ── 联系人/电话 ──────────────────────────────────────────────────
  ['univ_phone', '电话/手机', '((?:手机|电话|热线|传真|邮箱)?[：:]\\s*(?:1[3-9]\\d{9}|\\d{3,4}[-_]?\\d{7,8}))', 'regex', 'info'],
  ['univ_mobile', '手机', '1[3-9]\\d{9}', 'regex', 'info'],
  ['univ_landline', '固定电话', '\\d{3,4}[-_]?\\d{7,8}', 'regex', 'info'],
  // ── 地址 ─────────────────────────────────────────────────────────
  ['univ_address', '地址', '([^\n，。；;]{5,100}(?:省|市|区|县|路|街|号|栋|楼|室|层))', 'regex', 'info'],
  ['univ_postcode', '邮编', '\\d{6}', 'regex', 'info'],
  // ── 公司/组织 ────────────────────────────────────────────────────
  ['univ_company', '公司名称', '([^\n，。；;]{4,40}(?:公司|集团|有限|股份|院|所|中心|局|委员会|协会|联盟))', 'regex', 'info'],
  ['univ_credit_code', '统一社会信用代码', '[0-9A-HJ-NPQRTUWXY]{2}\\d{6}[0-9A-HJ-NPQRTUWXY]{10}', 'regex', 'info'],
  ['univ_tax_no', '税号', '[0-9A-Z]{15,20}', 'regex', 'info'],
  // ── 证件/资质 ────────────────────────────────────────────────────
  ['univ_id_card', '身份证号', '\\d{17}[\\dXx]', 'regex', 'info'],
  ['univ_license_no', '许可证/执照号', '([A-Z]{2,4}[-_]\\d{6,20}|\\d{12,20})', 'regex', 'info'],
  // ── 电子邮箱 ─────────────────────────────────────────────────────
  ['univ_email', '邮箱', '([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})', 'regex', 'info'],
  // ── 网址 ─────────────────────────────────────────────────────────
  ['univ_url', '网址/链接', '(https?://[^\\s<>"\']+|www\\.[^\\s<>"\']+)', 'regex', 'info'],
];

router.post('/universal', (_req, res) => {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)'
  );
  let added = 0;
  for (const r of UNIVERSAL_RULES) {
    const result = stmt.run(r[0], r[1], r[2], r[3], r[4]);
    if (result.changes > 0) added++;
  }
  const total = (db.prepare('SELECT COUNT(*) as c FROM extraction_rules').get() as any).c;
  res.json({ ok: true, added, total });
});

// Reset LLM skills to defaults (seeds if empty)
router.post('/llm-skills/reset', (_req, res) => {
  const seedSkills = [
    ['extract_project_info', '项目信息抽取技能', 'info', '你是招标文件抽取专家，下面是招标文件章节原文。\n只抽取【项目信息】的字段，严格遵守下面约束：\n1. 所有条款内容优先保留原文，不要改写、总结，禁止编造不存在信息；没有该字段则填空字符串""；\n2. 如果文本不属于目标章节，则返回空数组；\n3. 输出只能是JSON，禁止额外解释文字；\n4. 标星★条款标记isKey=true；\n\n原文chunk：\n{{chunkText}}', 0.1, 0.9, 2048],
    ['extract_business_clause', '商务条款抽取技能', 'business', '你是招标文件抽取专家，下面是招标文件章节原文。\n只抽取【商务条款】的字段，严格遵守下面约束：\n1. 所有条款内容优先保留原文，不要改写、总结，禁止编造不存在信息；\n2. 否决投标（废标）条款逐条拆分，一条为一项；\n3. 输出只能是JSON，禁止额外解释文字；\n\n原文chunk：\n{{chunkText}}', 0.1, 0.9, 2048],
    ['extract_tech_clause', '技术条款抽取技能', 'tech', '你是招标文件抽取专家，下面是招标文件章节原文。\n只抽取【技术条款】的字段，严格遵守下面约束：\n1. 所有条款内容优先保留原文，不要改写、总结，禁止编造不存在信息；\n2. 输出只能是JSON，禁止额外解释文字；\n\n原文chunk：\n{{chunkText}}', 0.1, 0.9, 2048],
    ['extract_score_standard', '评分标准抽取技能', 'score', '你是招标文件抽取专家，下面是招标文件章节原文。\n只抽取【评分标准】的字段，严格遵守下面约束：\n1. 所有条款内容优先保留原文，不要改写、总结；\n2. 分值数值必须准确；总分校验；\n3. 输出只能是JSON，禁止额外解释文字；\n\n原文chunk：\n{{chunkText}}', 0.1, 0.9, 2048],
    ['extract_seal_info', '封标信息抽取技能', 'seal', '你是招标文件抽取专家，下面是招标文件章节原文。\n只抽取【封标信息】的字段，严格遵守下面约束：\n1. 正副本份数、密封要求、标记要求逐条提取；\n2. 保留原文，不要改写；\n3. 输出只能是JSON，禁止额外解释文字；\n\n原文chunk：\n{{chunkText}}', 0.1, 0.9, 2048],
    ['extract_star_clause', '标星条款抽取技能', 'star', '你是招标文件抽取专家，下面是招标文件章节原文。\n只抽取【标星条款★】的字段，严格遵守下面约束：\n1. 带★标记的强制关键条款，漏召回是重大风险；\n2. 保留原文，逐条拆分；\n3. 输出只能是JSON，禁止额外解释文字；\n\n原文chunk：\n{{chunkText}}', 0.1, 0.9, 2048],
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO tender_llm_skill (skill_code, skill_name, biz_type, prompt_template, temperature, top_p, max_tokens, enable) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  let added = 0;
  for (const s of seedSkills) {
    const r = stmt.run(...s);
    if (r.changes > 0) added++;
  }
  const rows = db.prepare('SELECT * FROM tender_llm_skill ORDER BY create_time').all();
  res.json({ ok: true, added, total: rows.length });
});

// List correction history
router.get('/corrections', (req, res) => {
  const corrections = db.prepare('SELECT * FROM correction_history ORDER BY created_at DESC LIMIT 100').all();
  res.json(corrections);
});

// ═══════════════════════════════════════════════════════════
// LLM 技能管理（tender_llm_skill 表，V1.4）
// ═══════════════════════════════════════════════════════════

// List all LLM skills
router.get('/llm-skills', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, skill_name, skill_code, biz_type, prompt_template, temperature, top_p, max_tokens, enable, enable_llm, bind_prompt_template_id, bind_rules_json, llm_api_config_id, version, create_time, update_time FROM tender_llm_skill ORDER BY create_time DESC'
  ).all() as Array<any>;
  res.json(rows.map(r => ({
    ...r,
    enable_llm: !!r.enable_llm,
    bind_rules_json: r.bind_rules_json || '[]',
    bind_prompt_template_id: r.bind_prompt_template_id || '',
    llm_api_config_id: r.llm_api_config_id || '',
  })));
});

// Create LLM skill
router.post('/llm-skills', (req, res) => {
  const { skill_name, skill_code, biz_type, prompt_template, temperature, top_p, max_tokens, enable_llm, bind_prompt_template_id, bind_rules_json, llm_api_config_id } = req.body;
  if (!skill_name || !skill_code || !prompt_template) {
    res.status(400).json({ error: 'skill_name, skill_code, prompt_template required' });
    return;
  }
  const result = db.prepare(
    `INSERT INTO tender_llm_skill (skill_name, skill_code, biz_type, prompt_template, temperature, top_p, max_tokens, enable, enable_llm, bind_prompt_template_id, bind_rules_json, llm_api_config_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(
    skill_name, skill_code, biz_type || 'info', prompt_template,
    temperature ?? 0.1, top_p ?? 0.9, max_tokens ?? 2048,
    enable_llm ? 1 : 0,
    bind_prompt_template_id || '',
    bind_rules_json || '[]',
    llm_api_config_id || '',
  );
  const row = db.prepare('SELECT * FROM tender_llm_skill WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// Update LLM skill
router.put('/llm-skills/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM tender_llm_skill WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const { skill_name, biz_type, prompt_template, temperature, top_p, max_tokens, enable, enable_llm, bind_prompt_template_id, bind_rules_json, llm_api_config_id } = req.body;
  db.prepare(`UPDATE tender_llm_skill SET
    skill_name = COALESCE(?, skill_name),
    biz_type = COALESCE(?, biz_type),
    prompt_template = COALESCE(?, prompt_template),
    temperature = COALESCE(?, temperature),
    top_p = COALESCE(?, top_p),
    max_tokens = COALESCE(?, max_tokens),
    enable = COALESCE(?, enable),
    enable_llm = COALESCE(?, enable_llm),
    bind_prompt_template_id = COALESCE(?, bind_prompt_template_id),
    bind_rules_json = COALESCE(?, bind_rules_json),
    llm_api_config_id = COALESCE(?, llm_api_config_id),
    version = version + 1,
    update_time = datetime('now')
  WHERE id = ?`).run(
    skill_name, biz_type, prompt_template,
    temperature, top_p, max_tokens,
    enable !== undefined ? enable : undefined,
    enable_llm !== undefined ? (enable_llm ? 1 : 0) : undefined,
    bind_prompt_template_id, bind_rules_json, llm_api_config_id,
    req.params.id,
  );
  const row = db.prepare('SELECT * FROM tender_llm_skill WHERE id = ?').get(req.params.id);
  res.json(row);
});

// Delete LLM skill
router.delete('/llm-skills/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tender_llm_skill WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ deleted: true });
});

// Get available API configs for binding
router.get('/llm-api-configs', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, provider, model, region, base_url, enabled FROM api_configs WHERE enabled = 1 ORDER BY provider'
  ).all();
  res.json(rows);
});

export default router;
