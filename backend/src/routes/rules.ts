import { Router } from 'express';
import { db } from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const group = req.query.group as string | undefined;
  let rules;
  if (group) {
    rules = db.prepare('SELECT * FROM extraction_rules WHERE group_name = ? ORDER BY field_name').all(group);
  } else {
    rules = db.prepare('SELECT * FROM extraction_rules ORDER BY field_name').all();
  }
  res.json(rules);
});

router.post('/', (req, res) => {
  const { fieldName, pattern, category, groupName } = req.body;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, ?, ?, ?)`).run(id, fieldName, pattern || '', category || 'regex', groupName || 'bidding');
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(id);
  res.status(201).json(rule);
});

router.put('/:id', (req, res) => {
  const { fieldName, pattern, enabled, category, groupName } = req.body;
  db.prepare(`UPDATE extraction_rules SET field_name=?, pattern=?, enabled=?, category=?, group_name=? WHERE id=?`).run(fieldName, pattern ?? '', enabled ?? 1, category ?? 'regex', groupName ?? 'bidding', req.params.id);
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(req.params.id);
  res.json(rule);
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
      db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category, group_name) VALUES (?, ?, '', 'regex', ?)`).run(id, name, groupName || 'bidding');
      inserted.push(name);
    }
  }
  
  res.json({ inserted, count: inserted.length });
});

export default router;
