import { Router } from 'express';
import { db, encrypt, decrypt, maskKey } from '../database.js';

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
  const configs = db.prepare('SELECT id, provider, model, region, base_url, api_key FROM api_configs').all();
  const masked = configs.map((c: any) => ({
    ...c,
    api_key: c.api_key ? maskKey(decrypt(c.api_key)) : ''
  }));
  res.json(masked);
});

router.post('/apikeys', (req, res) => {
  const { provider, model, api_key, region, base_url } = req.body;
  const id = crypto.randomUUID();
  const encryptedKey = api_key ? encrypt(api_key) : '';
  db.prepare('INSERT INTO api_configs (id, provider, model, api_key, region, base_url) VALUES (?, ?, ?, ?, ?, ?)').run(id, provider, model, encryptedKey, region, base_url);
  res.status(201).json({ id, provider, model, region, base_url });
});

router.put('/apikeys/:id', (req, res) => {
  const { provider, model, api_key, region, base_url } = req.body;
  const encryptedKey = api_key ? encrypt(api_key) : '';
  db.prepare('UPDATE api_configs SET provider=?, model=?, api_key=?, region=?, base_url=? WHERE id=?').run(provider, model, encryptedKey, region, base_url, req.params.id);
  res.json({ updated: true });
});

router.delete('/apikeys/:id', (req, res) => {
  db.prepare('DELETE FROM api_configs WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
