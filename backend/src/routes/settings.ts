import { Router } from 'express';
import { db, encrypt } from '../database.js';
import { getLlmSettings, updateLlmSettings, getLlmStatus } from '../services/llmExtractor.js';

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
    api_key: '***'
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
  if (encryptedKey) {
    db.prepare('UPDATE api_configs SET provider=?, model=?, api_key=?, region=?, base_url=? WHERE id=?').run(provider, model, encryptedKey, region, base_url, req.params.id);
  } else {
    db.prepare('UPDATE api_configs SET provider=?, model=?, region=?, base_url=? WHERE id=?').run(provider, model, region, base_url, req.params.id);
  }
  res.json({ updated: true });
});

router.delete('/apikeys/:id', (req, res) => {
  db.prepare('DELETE FROM api_configs WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// ── LLM Enhancement Settings ───────────────────────────────────────

router.get('/llm_enhance', (_req, res) => {
  const settings = getLlmSettings();
  res.json(settings);
});

router.put('/llm_enhance', (req, res) => {
  const { enabled, provider, max_doc_chars, timeout_seconds } = req.body;
  const settings = updateLlmSettings({
    enabled: !!enabled,
    provider: provider || 'qwen-turbo',
    maxDocChars: max_doc_chars || 32000,
    timeoutSeconds: timeout_seconds || 60,
  });
  res.json(settings);
});

router.get('/llm_status', (_req, res) => {
  const status = getLlmStatus();
  res.json(status);
});

export default router;
