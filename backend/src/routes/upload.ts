import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseDocument } from '../services/docProcessor.js';
import { refineJob } from '../services/llmExtractor.js';
import { db } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

interface TableRow {
  cells: string[];
}

interface DocTable {
  rows: TableRow[];
}

interface ParseResult {
  status: string;
  text?: string;
  extracts?: Record<string, unknown>;
  groups?: Record<string, string>;
  chapters?: Array<{ title: string; content: string[]; page: number }>;
  tables?: DocTable[];
  pageCount?: number;
  paraToPage?: number[];
  error?: string;
}

interface JobEntry {
  filename: string;
  size: number;
  result: ParseResult;
  llmEnhanced: boolean;
  llmResults: Record<string, unknown>;
  llmFields: Record<string, 'llm'>;
  createdAt: number;
}

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour
const jobStore = new Map<string, JobEntry>();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ── Cleanup: expired jobs ────────────────────────────────────────────
function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [key, entry] of jobStore.entries()) {
    if (now - entry.createdAt > JOB_TTL_MS) {
      jobStore.delete(key);
    }
  }
}

// ── Cleanup: old uploaded files (> 24 hours) ─────────────────────────
function cleanupOldUploads() {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // skip individual file errors
      }
    }
  } catch {
    // skip directory read errors
  }
}

// Run cleanup on startup
cleanupOldUploads();

// Periodic cleanup: jobs every 10 min, uploads every 1 hour
setInterval(cleanupExpiredJobs, 10 * 60 * 1000);
setInterval(cleanupOldUploads, 60 * 60 * 1000);

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const result = await parseDocument(req.file.path);

    if (result.status === 'error') {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        error: result.error || '解析失败'
      });
    }

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const jobId = req.file.filename;

    // Check if LLM enhancement is requested
    const enhanceLlm = req.query.enhance === 'llm';
    let llmEnhanced = false;
    let llmResults: Record<string, unknown> = {};
    let llmFields: Record<string, 'llm'> = {};

    if (enhanceLlm) {
      try {
        const settings = db.prepare('SELECT * FROM llm_enhance_settings WHERE id = 1').get() as any;
        if (settings && settings.enabled) {
          const refineResult = await refineJob(jobId, result);
          if (refineResult.success && refineResult.fieldsExtracted > 0) {
            llmEnhanced = true;
          }
        }
      } catch (llmErr: any) {
        console.error('[Upload] LLM enhancement failed:', llmErr.message);
      }
    }

    jobStore.set(jobId, {
      filename: originalName,
      size: req.file.size,
      result,
      llmEnhanced,
      llmResults,
      llmFields,
      createdAt: Date.now()
    });

    res.status(201).json({
      id: jobId,
      filename: originalName,
      size: req.file.size,
      status: 'parsed',
      llmEnhanced,
      result
    });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message || '解析过程中发生错误' });
  }
});

router.get('/:id/status', (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const filePath = path.join(UPLOAD_DIR, req.params.id);
  const fileStat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

  res.json({
    id: req.params.id,
    status: 'parsed',
    progress: 100,
    filename: job.filename,
    fileSize: fileStat?.size || job.size,
    llmEnhanced: job.llmEnhanced,
    llmFields: job.llmFields,
    result: job.result
  });
});

router.delete('/:id', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  jobStore.delete(req.params.id);
  res.json({ deleted: true });
});

router.get('/file/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.sendFile(filePath);
});

// ── LLM Refinement ─────────────────────────────────────────────────

router.post('/:id/refine', async (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.llmEnhanced) {
    return res.status(400).json({ error: 'Already enhanced with LLM' });
  }

  try {
    const settingsCheck = db.prepare('SELECT enabled FROM llm_enhance_settings WHERE id = 1').get() as any;
    if (!settingsCheck?.enabled) {
      return res.status(400).json({ error: 'LLM enhancement is not enabled in settings' });
    }

    const keyCheck = db.prepare('SELECT id FROM api_configs LIMIT 1').all();
    if (keyCheck.length === 0) {
      return res.status(400).json({ error: 'No API keys configured' });
    }

    let queued = false;
    const result = await refineJob(req.params.id, job.result, () => { queued = true; });

    if (result.success && result.merged && result.llmFields) {
      job.llmEnhanced = true;
      job.llmResults = result.merged;
      job.llmFields = result.llmFields;
      job.result.extracts = result.merged;
    }

    res.json({
      success: result.success,
      fieldsExtracted: result.fieldsExtracted,
      totalFields: result.totalFields,
      source: result.source,
      queued,
    });
  } catch (err: any) {
    console.error('[Refine] Error:', err.message);
    res.status(500).json({ error: err.message || 'Refinement failed' });
  }
});

export default router;
