import { Router } from 'express';
import multer from 'multer';
import yaml from 'js-yaml';
import { db } from '../database.js';

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

// Import rules from a skill.md file (YAML frontmatter)
router.post('/import-skill', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const content = req.file.buffer.toString('utf-8');

    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      res.status(400).json({ error: 'No YAML frontmatter found (must start and end with ---)' });
      return;
    }

    const fm = yaml.load(fmMatch[1]) as any;
    if (!fm || !Array.isArray(fm.rules)) {
      res.status(400).json({ error: 'Frontmatter must contain a "rules" array' });
      return;
    }

    const name = fm.name || req.file.originalname.replace(/\.md$/i, '');
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

    res.json({ name, inserted, skipped, count: inserted.length });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse skill file: ${err.message}` });
  }
});

export default router;
