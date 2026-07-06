import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  const rules = db.prepare('SELECT * FROM extraction_rules ORDER BY field_name').all();
  res.json(rules);
});

router.post('/', (req, res) => {
  const { fieldName, pattern, category } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (?, ?, ?, ?)`).run(id, fieldName, pattern, category || 'regex');
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(id);
  res.status(201).json(rule);
});

router.put('/:id', (req, res) => {
  const { fieldName, pattern, enabled } = req.body;
  db.prepare(`UPDATE extraction_rules SET field_name=?, pattern=?, enabled=? WHERE id=?`).run(fieldName, pattern, enabled ?? 1, req.params.id);
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(req.params.id);
  res.json(rule);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM extraction_rules WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
