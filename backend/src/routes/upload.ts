import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseDocument } from '../services/docProcessor.js';
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
  error?: string;
}

const jobStore = new Map<string, { filename: string; size: number; result: ParseResult }>();

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
    const allowed = ['.pdf', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

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

    jobStore.set(req.file.filename, {
      filename: originalName,
      size: req.file.size,
      result: result
    });

    res.status(201).json({
      id: req.file.filename,
      filename: originalName,
      size: req.file.size,
      status: 'parsed',
      result: result
    });
  } catch (err: any) {
    if (fs.existsSync(req.file.path)) {
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

export default router;
