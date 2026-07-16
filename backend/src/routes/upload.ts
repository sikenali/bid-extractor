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

  try {
    const rules = db.prepare('SELECT field_name, pattern FROM extraction_rules WHERE enabled = 1').all();
    const rulesList = rules.map((r: any) => ({
      name: r.field_name,
      pattern: r.pattern
    }));

    const result = await parseDocument(req.file.path);

    if (result.status === 'error') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: result.error || '解析失败'
      });
    }

    res.status(201).json({
      id: req.file.filename,
      filename: req.file.originalname,
      size: req.file.size,
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
  res.json({
    id: req.params.id,
    status: 'not_found',
    message: '请使用 /api/upload 直接获取解析结果'
  });
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