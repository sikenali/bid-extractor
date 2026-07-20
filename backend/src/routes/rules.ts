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
    let name = req.file.originalname.replace(/\.(md|yaml|yml)$/i, '');

    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      // Plain markdown prompt — store as prompt skill
      const skills = readSkills();
      const existing = skills.findIndex(s => s.name === name);
      const meta: SkillMeta = {
        name,
        description: content.split('\n')[0]?.replace(/^#\s*/, '') || name,
        group: 'info',
        type: 'prompt',
        fields: [],
        content,
        importedAt: new Date().toISOString(),
      };
      if (existing >= 0) {
        skills[existing] = meta;
      } else {
        skills.push(meta);
      }
      writeSkills(skills);
      res.json({ name, description: meta.description, group: 'info', type: 'prompt', count: 0 });
      return;
    }

    const fm = load(fmMatch[1]) as any;
    if (!fm || !Array.isArray(fm.rules)) {
      // YAML but no rules array — also store as prompt
      const skills = readSkills();
      const existing = skills.findIndex(s => s.name === name);
      const meta: SkillMeta = {
        name,
        description: fm?.description || name,
        group: fm?.group || 'info',
        type: 'prompt',
        fields: [],
        content: content.replace(/^---[\s\S]*?---\n*/, ''),
        importedAt: new Date().toISOString(),
      };
      if (existing >= 0) {
        skills[existing] = meta;
      } else {
        skills.push(meta);
      }
      writeSkills(skills);
      res.json({ name, description: meta.description, group: meta.group, type: 'prompt', count: 0 });
      return;
    }

    name = fm.name || req.file.originalname.replace(/\.md$/i, '');
    const defaultGroup = fm.group || 'info';
    const inserted: { field: string; group: string; category: string }[] = [];
    const skipped: string[] = [];
    const existing = db.prepare('SELECT field_name, group_name FROM extraction_rules').all() as any[];
    const existingSet = new Set(existing.map((r: any) => `${r.field_name}|${r.group_name}`));

    for (const rule of fm.rules) {
      if (!rule.field) continue;
      const group = rule.group || defaultGroup;
      const category = rule.type === 'regex' ? 'regex' : 'keyword';
      const pattern = rule.pattern || '';
      const key = `${rule.field}|${group}`;

      if (existingSet.has(key)) {
        skipped.push(rule.field);
        continue;
      }

      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)`)
        .run(id, rule.field, pattern, category, group);
      inserted.push({ field: rule.field, group, category });
      existingSet.add(key);
    }

    // Persist skill metadata (always save, even if all rules were skipped)
    {
      const skills = readSkills();
      const existing = skills.findIndex(s => s.name === name);
      const allFields = fm.rules.map((r: any) => r.field).filter(Boolean);
      const meta: SkillMeta = {
        name,
        description: fm.description || '',
        group: defaultGroup,
        type: 'rules',
        fields: allFields,
        importedAt: new Date().toISOString(),
      };
      if (existing >= 0) {
        skills[existing] = meta;
      } else {
        skills.push(meta);
      }
      writeSkills(skills);
    }

    res.json({ name, description: fm.description || '', group: defaultGroup, inserted, skipped, count: inserted.length });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse skill file: ${err.message}` });
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

export default router;
