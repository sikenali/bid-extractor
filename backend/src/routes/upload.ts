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

interface ParseJob {
  id: string;
  filename: string;
  filePath: string;
  fileSize: number;
  status: 'uploading' | 'parsing' | 'parsed' | 'error';
  progress: number;
  result?: any;
  error?: string;
  startTime?: number;
}

const jobs: Map<string, ParseJob> = new Map();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
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

  const jobId = req.file.filename;
  const job: ParseJob = {
    id: jobId,
    filename: req.file.originalname,
    filePath: req.file.path,
    fileSize: req.file.size,
    status: 'parsing',
    progress: 0,
    startTime: Date.now()
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      const rules = db.prepare('SELECT field_name, pattern FROM extraction_rules WHERE enabled = 1').all();
      const rulesList = rules.map((r: any) => ({
        name: r.field_name,
        pattern: r.pattern
      }));
      job.progress = 20;

      const result = await parseDocument(req.file!.path);

      if (result.status === 'error') {
        job.status = 'error';
        job.error = result.error;
        job.progress = 100;
      } else {
        job.status = 'parsed';
        job.progress = 100;
        job.result = result;
      }
    } catch (err: any) {
      job.status = 'error';
      job.error = err.message;
      job.progress = 100;
    }
  })();

  res.status(201).json({
    id: jobId,
    filename: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
    status: 'parsing'
  });
});

router.get('/:id/status', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  let displayProgress = job.progress;
  if (job.status === 'parsing' && job.startTime) {
    const elapsed = Date.now() - job.startTime;
    if (elapsed > 3000 && displayProgress < 80) {
      displayProgress = Math.min(displayProgress + (elapsed / 10000), 80);
    }
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: displayProgress,
    filename: job.filename,
    fileSize: job.fileSize,
    error: job.error,
    result: job.result
  });
});

router.get('/:id/result', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    result: job.result,
    error: job.error
  });
});

router.delete('/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (job) {
    const filePath = path.join(UPLOAD_DIR, req.params.id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    jobs.delete(req.params.id);
  }
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