import { Router } from 'express';
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

interface SkillParseResult {
  name: string;
  description: string;
  group: string;
  type: 'rules' | 'prompt';
  fields: string[];
  content?: string;
  inserted: number;
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
      skipped: [],
    };
  }

  const name = fm.name || nameFromFile;
  const defaultGroup = fm.group || 'info';
  const existing = db.prepare('SELECT field_name, group_name FROM extraction_rules').all() as any[];
  const existingSet = new Set(existing.map((r: any) => `${r.field_name}|${r.group_name}`));

  const allFields: string[] = [];
  const skipped: string[] = [];
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

    db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), rule.field, pattern, category, group);
    inserted++;
    existingSet.add(key);
  }

  return {
    name,
    description: fm.description || '',
    group: defaultGroup,
    type: 'rules',
    fields: allFields,
    inserted,
    skipped,
  };
}

function saveSkillMeta(meta: SkillMeta) {
  const skills = readSkills();
  const existing = skills.findIndex(s => s.name === meta.name);
  if (existing >= 0) {
    skills[existing] = meta;
  } else {
    skills.push(meta);
  }
  writeSkills(skills);
}

const router = Router();

// Curated vocabulary suggestions per group
const vocabularySuggestions: Record<string, { field: string; pattern: string; category: string }[]> = {
  info: [
    { field: '项目名称', pattern: '', category: 'keyword' },
    { field: '项目编号', pattern: '', category: 'keyword' },
    { field: '招标编号', pattern: '', category: 'keyword' },
    { field: '采购人', pattern: '', category: 'keyword' },
    { field: '采购代理', pattern: '', category: 'keyword' },
    { field: '采购方式', pattern: '', category: 'keyword' },
    { field: '资金来源', pattern: '', category: 'keyword' },
    { field: '预算金额', pattern: '', category: 'keyword' },
    { field: '最高限价', pattern: '', category: 'keyword' },
    { field: '投标截止时间', pattern: '', category: 'keyword' },
    { field: '开标时间', pattern: '', category: 'keyword' },
    { field: '投标地点', pattern: '', category: 'keyword' },
    { field: '开标地点', pattern: '', category: 'keyword' },
    { field: '踏勘时间', pattern: '', category: 'keyword' },
    { field: '答疑时间', pattern: '', category: 'keyword' },
    { field: '交付时间', pattern: '', category: 'keyword' },
    { field: '交付地点', pattern: '', category: 'keyword' },
    { field: '投标保证金', pattern: '', category: 'keyword' },
    { field: '保证金金额', pattern: '', category: 'keyword' },
    { field: '合同包号', pattern: '', category: 'keyword' },
    { field: '分包情况', pattern: '', category: 'keyword' },
    { field: '采购需求', pattern: '', category: 'keyword' },
    { field: '采购内容', pattern: '', category: 'keyword' },
    { field: '项目概况', pattern: '', category: 'keyword' },
    { field: '招标范围', pattern: '', category: 'keyword' },
    { field: '标段划分', pattern: '', category: 'keyword' },
    { field: '联合体投标', pattern: '', category: 'keyword' },
    { field: '进口产品', pattern: '', category: 'keyword' },
    { field: '节能环保', pattern: '', category: 'keyword' },
    { field: '面向中小微', pattern: '', category: 'keyword' },
    { field: '合格投标人', pattern: '', category: 'keyword' },
    { field: '是否接受联合体', pattern: '', category: 'keyword' },
  ],
  business: [
    { field: '付款方式', pattern: '', category: 'keyword' },
    { field: '付款条件', pattern: '', category: 'keyword' },
    { field: '付款进度', pattern: '', category: 'keyword' },
    { field: '质保期', pattern: '', category: 'keyword' },
    { field: '质保要求', pattern: '', category: 'keyword' },
    { field: '履约保证金', pattern: '', category: 'keyword' },
    { field: '履约期限', pattern: '', category: 'keyword' },
    { field: '交货期', pattern: '', category: 'keyword' },
    { field: '交货地点', pattern: '', category: 'keyword' },
    { field: '供货周期', pattern: '', category: 'keyword' },
    { field: '售后服务', pattern: '', category: 'keyword' },
    { field: '售后响应', pattern: '', category: 'keyword' },
    { field: '培训要求', pattern: '', category: 'keyword' },
    { field: '验收标准', pattern: '', category: 'keyword' },
    { field: '验收方式', pattern: '', category: 'keyword' },
    { field: '合同条款', pattern: '', category: 'keyword' },
    { field: '合同签订', pattern: '', category: 'keyword' },
    { field: '违约责任', pattern: '', category: 'keyword' },
    { field: '争议解决', pattern: '', category: 'keyword' },
    { field: '保密要求', pattern: '', category: 'keyword' },
    { field: '知识产权', pattern: '', category: 'keyword' },
    { field: '投标有效期', pattern: '', category: 'keyword' },
    { field: '报价要求', pattern: '', category: 'keyword' },
    { field: '发票要求', pattern: '', category: 'keyword' },
    { field: '保险要求', pattern: '', category: 'keyword' },
    { field: '分包转包', pattern: '', category: 'keyword' },
    { field: '联合体要求', pattern: '', category: 'keyword' },
    { field: '资质要求', pattern: '', category: 'keyword' },
    { field: '业绩要求', pattern: '', category: 'keyword' },
    { field: '人员配置要求', pattern: '', category: 'keyword' },
  ],
  tech: [
    { field: '技术规格', pattern: '', category: 'keyword' },
    { field: '技术要求', pattern: '', category: 'keyword' },
    { field: '技术参数', pattern: '', category: 'keyword' },
    { field: '技术标准', pattern: '', category: 'keyword' },
    { field: '功能要求', pattern: '', category: 'keyword' },
    { field: '性能指标', pattern: '', category: 'keyword' },
    { field: '配置要求', pattern: '', category: 'keyword' },
    { field: '安装要求', pattern: '', category: 'keyword' },
    { field: '调试要求', pattern: '', category: 'keyword' },
    { field: '培训方案', pattern: '', category: 'keyword' },
    { field: '技术资料', pattern: '', category: 'keyword' },
    { field: '技术文档', pattern: '', category: 'keyword' },
    { field: '验收测试', pattern: '', category: 'keyword' },
    { field: '质量标准', pattern: '', category: 'keyword' },
    { field: '安全要求', pattern: '', category: 'keyword' },
    { field: '环保要求', pattern: '', category: 'keyword' },
    { field: '产品证书', pattern: '', category: 'keyword' },
    { field: '检测报告', pattern: '', category: 'keyword' },
    { field: '服务内容', pattern: '', category: 'keyword' },
    { field: '服务标准', pattern: '', category: 'keyword' },
    { field: '实施方案', pattern: '', category: 'keyword' },
    { field: '运维要求', pattern: '', category: 'keyword' },
    { field: '备品备件', pattern: '', category: 'keyword' },
    { field: '软件要求', pattern: '', category: 'keyword' },
    { field: '硬件要求', pattern: '', category: 'keyword' },
    { field: '网络要求', pattern: '', category: 'keyword' },
    { field: '数据安全', pattern: '', category: 'keyword' },
    { field: '接口要求', pattern: '', category: 'keyword' },
    { field: '兼容性要求', pattern: '', category: 'keyword' },
    { field: '扩展性要求', pattern: '', category: 'keyword' },
  ],
  score: [
    { field: '评标办法', pattern: '', category: 'keyword' },
    { field: '评分标准', pattern: '', category: 'keyword' },
    { field: '评分细则', pattern: '', category: 'keyword' },
    { field: '评分表', pattern: '', category: 'keyword' },
    { field: '评分项', pattern: '', category: 'keyword' },
    { field: '分值', pattern: '', category: 'keyword' },
    { field: '满分', pattern: '', category: 'keyword' },
    { field: '合格分数线', pattern: '', category: 'keyword' },
    { field: '价格评分', pattern: '', category: 'keyword' },
    { field: '技术评分', pattern: '', category: 'keyword' },
    { field: '商务评分', pattern: '', category: 'keyword' },
    { field: '客观分', pattern: '', category: 'keyword' },
    { field: '主观分', pattern: '', category: 'keyword' },
    { field: '价格扣除', pattern: '', category: 'keyword' },
    { field: '优先采购', pattern: '', category: 'keyword' },
    { field: '评审因素', pattern: '', category: 'keyword' },
    { field: '评分说明', pattern: '', category: 'keyword' },
    { field: '评分依据', pattern: '', category: 'keyword' },
    { field: '价格分计算公式', pattern: '', category: 'keyword' },
    { field: '权重', pattern: '', category: 'keyword' },
    { field: '权重占比', pattern: '', category: 'keyword' },
    { field: '加分项', pattern: '', category: 'keyword' },
    { field: '扣分项', pattern: '', category: 'keyword' },
    { field: '最低得分', pattern: '', category: 'keyword' },
    { field: '评标基准价', pattern: '', category: 'keyword' },
    { field: '投标报价得分', pattern: '', category: 'keyword' },
    { field: '技术评审', pattern: '', category: 'keyword' },
    { field: '商务评审', pattern: '', category: 'keyword' },
    { field: '价格评审', pattern: '', category: 'keyword' },
    { field: '综合评分', pattern: '', category: 'keyword' },
  ],
  seal: [
    { field: '封标要求', pattern: '', category: 'keyword' },
    { field: '密封要求', pattern: '', category: 'keyword' },
    { field: '封装方式', pattern: '', category: 'keyword' },
    { field: '正本数量', pattern: '', category: 'keyword' },
    { field: '副本数量', pattern: '', category: 'keyword' },
    { field: '电子文件', pattern: '', category: 'keyword' },
    { field: '密封袋标识', pattern: '', category: 'keyword' },
    { field: '外层信封', pattern: '', category: 'keyword' },
    { field: '内层信封', pattern: '', category: 'keyword' },
    { field: '密封处盖章', pattern: '', category: 'keyword' },
    { field: '密封条', pattern: '', category: 'keyword' },
    { field: '封装格式', pattern: '', category: 'keyword' },
    { field: '纸质文件', pattern: '', category: 'keyword' },
    { field: '密封截止时间', pattern: '', category: 'keyword' },
    { field: '递交方式', pattern: '', category: 'keyword' },
    { field: '邮寄要求', pattern: '', category: 'keyword' },
    { field: '现场递交', pattern: '', category: 'keyword' },
    { field: '密封袋', pattern: '', category: 'keyword' },
    { field: '密封章', pattern: '', category: 'keyword' },
    { field: '密封处', pattern: '', category: 'keyword' },
    { field: '密封条要求', pattern: '', category: 'keyword' },
    { field: '外层密封', pattern: '', category: 'keyword' },
    { field: '内层密封', pattern: '', category: 'keyword' },
    { field: '正副本标识', pattern: '', category: 'keyword' },
    { field: '密封处签字', pattern: '', category: 'keyword' },
    { field: '密封处盖章要求', pattern: '', category: 'keyword' },
    { field: '密封处骑缝章', pattern: '', category: 'keyword' },
    { field: '密封处加盖公章', pattern: '', category: 'keyword' },
    { field: '密封处加盖法人章', pattern: '', category: 'keyword' },
    { field: '密封处加盖密封章', pattern: '', category: 'keyword' },
  ],
  star: [
    { field: '★号条款', pattern: '', category: 'keyword' },
    { field: '★条款', pattern: '', category: 'keyword' },
    { field: '星号条款', pattern: '', category: 'keyword' },
    { field: '▲号条款', pattern: '', category: 'keyword' },
    { field: '三角形条款', pattern: '', category: 'keyword' },
    { field: '●号条款', pattern: '', category: 'keyword' },
    { field: '◆号条款', pattern: '', category: 'keyword' },
    { field: '※号条款', pattern: '', category: 'keyword' },
    { field: '⚠号条款', pattern: '', category: 'keyword' },
    { field: '☆号条款', pattern: '', category: 'keyword' },
    { field: '△号条款', pattern: '', category: 'keyword' },
    { field: '○号条款', pattern: '', category: 'keyword' },
    { field: '◇号条款', pattern: '', category: 'keyword' },
    { field: '重要条款', pattern: '', category: 'keyword' },
    { field: '关键条款', pattern: '', category: 'keyword' },
    { field: '否决条款', pattern: '', category: 'keyword' },
    { field: '废标条款', pattern: '', category: 'keyword' },
    { field: '实质性条款', pattern: '', category: 'keyword' },
    { field: '不可偏离条款', pattern: '', category: 'keyword' },
    { field: '必须响应条款', pattern: '', category: 'keyword' },
    { field: '强制要求', pattern: '', category: 'keyword' },
    { field: '硬性要求', pattern: '', category: 'keyword' },
    { field: '底线要求', pattern: '', category: 'keyword' },
    { field: '一票否决', pattern: '', category: 'keyword' },
    { field: '★号参数', pattern: '', category: 'keyword' },
    { field: '▲号参数', pattern: '', category: 'keyword' },
    { field: '核心指标', pattern: '', category: 'keyword' },
    { field: '关键指标', pattern: '', category: 'keyword' },
    { field: '必须满足', pattern: '', category: 'keyword' },
    { field: '不允许负偏离', pattern: '', category: 'keyword' },
  ],
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 * 1024 * 1024 } });

function mapRule(r: any) {
  return {
    id: r.id,
    fieldName: r.field_name,
    pattern: r.pattern,
    enabled: r.enabled,
    category: r.category,
    groupName: r.group_name,
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
  const { fieldName, pattern, category, groupName } = req.body;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)`).run(id, fieldName, pattern || '', category || 'regex', groupName || 'info');
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(id);
  res.status(201).json(mapRule(rule as any));
});

router.put('/:id', (req, res) => {
  const { fieldName, pattern, enabled, category, groupName } = req.body;
  db.prepare(`UPDATE extraction_rules SET field_name=?, pattern=?, enabled=?, category=?, group_name=? WHERE id=?`).run(fieldName, pattern ?? '', enabled ?? 1, category ?? 'regex', groupName ?? 'info', req.params.id);
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(req.params.id);
  res.json(mapRule(rule as any));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM extraction_rules WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// Auto-discover new extracted fields and add them as rules
router.post('/discover', (req, res) => {
  const { fieldNames, groupName } = req.body;
  if (!fieldNames || !Array.isArray(fieldNames)) {
    res.status(400).json({ error: 'fieldNames is required' });
    return;
  }
  const inserted: string[] = [];
  const existing = db.prepare('SELECT field_name FROM extraction_rules').all();
  const existingNames = new Set(existing.map((r: any) => r.field_name));
  
  for (const name of fieldNames) {
    if (!existingNames.has(name)) {
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, '', 'keyword', ?)`).run(id, name, groupName || 'info');
      inserted.push(name);
    }
  }
  
  res.json({ inserted, count: inserted.length });
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
  db.prepare('DELETE FROM extraction_rules WHERE group_name = ? AND field_name IN (' +
    skill.fields.map(() => '?').join(',') + ')').run(skill.group, ...skill.fields);
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
      importedAt: new Date().toISOString(),
    };
    saveSkillMeta(meta);
    res.json({
      name: meta.name,
      description: meta.description,
      group: meta.group,
      type: meta.type,
      inserted: result.inserted,
      skipped: result.skipped,
      count: result.inserted,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse skill file: ${err.message}` });
  }
});

// Sync skills from local directory (backend/data/skills/*.md)
router.post('/sync-skills', (_req, res) => {
  try {
    if (!fs.existsSync(localSkillsDir)) {
      res.json({ synced: 0, skills: [], message: '本地技能目录不存在' });
      return;
    }
    const files = fs.readdirSync(localSkillsDir).filter(f => /\.(md|yaml|yml)$/i.test(f));
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

// Get vocabulary suggestions for a group (keywords not yet in the database)
router.get('/suggestions/:group', (req, res) => {
  const group = req.params.group;
  const suggestions = vocabularySuggestions[group] || [];
  const existing = db.prepare('SELECT field_name, group_name FROM extraction_rules WHERE group_name = ?').all(group) as any[];
  const existingSet = new Set(existing.map((r: any) => r.field_name));
  const available = suggestions.filter(s => !existingSet.has(s.field));
  res.json(available);
});

// Batch add suggested keywords
router.post('/suggestions/batch-add', (req, res) => {
  const { group, fields } = req.body;
  if (!group || !Array.isArray(fields)) {
    res.status(400).json({ error: 'group and fields array required' });
    return;
  }
  const insertStmt = db.prepare('INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name, enabled) VALUES (?, ?, ?, ?, ?, 1)');
  let inserted = 0;
  for (const field of fields) {
    const result = insertStmt.run(crypto.randomUUID(), field, '', 'keyword', group);
    if (result.changes > 0) inserted++;
  }
  res.json({ inserted });
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
const SEED_CORE_RULES: Array<{ id: string; field: string; group: string }> = [
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
];

// Reset all extraction rules to seed defaults
router.post('/reset', (_req, res) => {
  const existing = new Set(
    (db.prepare('SELECT field_name, group_name FROM extraction_rules').all() as any[])
      .map(r => `${r.field_name}|${r.group_name}`),
  );
  const stmt = db.prepare('INSERT OR IGNORE INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)');
  stmt.run('info_project_name', '项目名称',
    '(?:(?:项目|采购|工程|服务)\\s*(?:名称|内容|概述|概况)|招标内容|本次招标(?:内容|范围)|采购内容)[：:]?\\s*((?:(?!(?:项目|招标|采购)编号|招标方式|采购方式)[^\\n]){6,})',
    'regex', 'info');
  let added = 0;
  for (const s of SEED_CORE_RULES) {
    if (existing.has(`${s.field}|${s.group}`)) continue;
    const r = stmt.run(s.id, s.field, '', 'keyword', s.group);
    if (r.changes > 0) added++;
  }
  res.json({ ok: true, added });
});

// Reset skills to empty (user-imported skills only)
router.post('/reset-skills', (_req, res) => {
  writeSkills([]);
  res.json({ ok: true });
});

// List correction history
router.get('/corrections', (req, res) => {
  const corrections = db.prepare('SELECT * FROM correction_history ORDER BY created_at DESC LIMIT 100').all();
  res.json(corrections);
});

export default router;
