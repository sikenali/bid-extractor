import { Router } from 'express';
import { db, encrypt } from '../database.js';

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
  const {
    format, include_table_of_contents, page_numbers, header_footer,
    word_keep_style, word_toc, word_embed_font,
    pdf_high_res, pdf_bookmarks, pdf_watermark,
    md_keep_tables, md_demote_heading,
  } = req.body;
  db.prepare(`UPDATE export_settings SET
    format=?, include_table_of_contents=?, page_numbers=?, header_footer=?,
    word_keep_style=?, word_toc=?, word_embed_font=?,
    pdf_high_res=?, pdf_bookmarks=?, pdf_watermark=?,
    md_keep_tables=?, md_demote_heading=?
    WHERE id = 1`
  ).run(
    format ?? 'docx',
    include_table_of_contents ?? 1,
    page_numbers ?? 1,
    header_footer ?? 1,
    word_keep_style ?? 1,
    word_toc ?? 1,
    word_embed_font ?? 0,
    pdf_high_res ?? 1,
    pdf_bookmarks ?? 1,
    pdf_watermark ?? 0,
    md_keep_tables ?? 1,
    md_demote_heading ?? 0,
  );
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

export default router;
