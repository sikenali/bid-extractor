import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Theme
router.get('/theme', (_req, res) => {
  const config = db.prepare('SELECT * FROM theme_config WHERE id = 1').get();
  res.json(config);
});

router.put('/theme', (req, res) => {
  const { type } = req.body;
  db.prepare('UPDATE theme_config SET type = ? WHERE id = 1').run(type);
  const config = db.prepare('SELECT * FROM theme_config WHERE id = 1').get();
  res.json(config);
});

// Export
router.get('/export', (_req, res) => {
  const settings = db.prepare('SELECT * FROM export_settings WHERE id = 1').get();
  res.json(settings);
});

router.put('/export', (req, res) => {
  const { format, include_table_of_contents, page_numbers } = req.body;
  db.prepare('UPDATE export_settings SET format=?, include_table_of_contents=?, page_numbers=? WHERE id = 1').run(format, include_table_of_contents ?? 1, page_numbers ?? 1);
  const settings = db.prepare('SELECT * FROM export_settings WHERE id = 1').get();
  res.json(settings);
});

// API Keys
router.get('/apikeys', (_req, res) => {
  const configs = db.prepare('SELECT id, provider, model, region FROM api_configs').all();
  res.json(configs);
});

router.post('/apikeys', (req, res) => {
  const { provider, model, api_key, region } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO api_configs (id, provider, model, api_key, region) VALUES (?, ?, ?, ?, ?)`).run(id, provider, model, api_key, region);
  res.status(201).json({ id, provider, model, region });
});

router.put('/apikeys/:id', (req, res) => {
  const { provider, model, api_key, region } = req.body;
  db.prepare('UPDATE api_configs SET provider=?, model=?, api_key=?, region=? WHERE id=?').run(provider, model, api_key, region, req.params.id);
  res.json({ updated: true });
});

router.delete('/apikeys/:id', (req, res) => {
  db.prepare('DELETE FROM api_configs WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
