import { Router } from 'express';
import { db } from '../database.js';

const router = Router();

// ── GET /api/tasks — list all tasks with optional filters ────────────
router.get('/', (req, res) => {
  const { status, skill_name, page = 1, page_size = 20 } = req.query;
  let sql = 'SELECT * FROM extraction_tasks WHERE 1=1';
  const params: any[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (skill_name) { sql += ' AND skill_name LIKE ?'; params.push(`%${skill_name}%`); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(page_size), (Number(page) - 1) * Number(page_size));
  const rows = db.prepare(sql).all(...params) as any[];

  const total = (db.prepare('SELECT COUNT(*) as c FROM extraction_tasks').get() as any).c;
  res.json({ items: rows, total, page: Number(page), page_size: Number(page_size) });
});

// ── GET /api/tasks/:id — single task detail ─────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM extraction_tasks WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(row);
});

// ── DELETE /api/tasks/:id — delete a task ───────────────────────────
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM extraction_tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ deleted: true });
});

// ── POST /api/tasks/clear — clear completed tasks ───────────────────
router.post('/clear', (req, res) => {
  const { days = 7 } = req.body;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare("DELETE FROM extraction_tasks WHERE created_at < ?").run(cutoff);
  res.json({ cleared: result.changes });
});

// ── POST /api/tasks/export — bulk export IDs (for future CSV/JSON) ──
router.post('/export', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids array required' });
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id, filename, skill_name, status, extract_mode, result_json, created_at, completed_at FROM extraction_tasks WHERE id IN (${placeholders})`).all(...ids) as any[];
  res.json(rows);
});

export default router;
