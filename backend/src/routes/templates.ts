import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const type = req.query.type as string | undefined;
  let rows;
  if (type) {
    rows = db.prepare('SELECT * FROM templates WHERE type = ?').all(type);
  } else {
    rows = db.prepare('SELECT * FROM templates').all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { type, category, name, description } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO templates (id, type, category, name, description) VALUES (?, ?, ?, ?, ?)`).run(id, type, category, name, description);
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  res.status(201).json(template);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
