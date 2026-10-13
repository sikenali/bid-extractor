import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseDocument } from '../services/docProcessor.js';
import type { ExtractOutput } from '../services/docProcessor.js';
import { db } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const baseDir = process.env.BID_EXTRACTOR_DATA_DIR || path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(baseDir, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

interface JobEntry {
  filename: string;
  size: number;
  result: ExtractOutput;
  createdAt: number;
  skillId?: string;
  progress: number;
  progressText: string;
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
    const allowed = ['.docx', '.pdf', '.md', '.txt', '.xlsx', '.csv', '.html'];
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

  const skillId = req.body?.skill_id as string | undefined;

  try {
    const result = await parseDocument(req.file.path, { skillId });
    const warnings = result.fileMeta?.warningList || [];
    const hasErrors = warnings.some(w => w.includes('失败') || w.includes('不支持') || w.includes('不存在'));

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const jobId = req.file.filename;

    jobStore.set(jobId, {
      filename: originalName,
      size: req.file.size,
      result,
      createdAt: Date.now(),
      skillId,
      progress: 3,
      progressText: '已完成',
    });

    // 持久化到 doc_results 表
    try {
      const resultJson = JSON.stringify({
        fileMeta: result.fileMeta,
        extractResult: result.extractResult,
        validateResult: result.validateResult,
        extractMode: result.extractMode,
        markedItems: result.markedItems,
        groups: result.groups,
        fieldGroups: result.fieldGroups,
        fieldParaMap: result.fieldParaMap,
        pageCount: result.pageCount,
      });
      db.prepare(`INSERT INTO doc_results (id, filename, file_size, result_json, created_at)
                  VALUES (?, ?, ?, ?, datetime('now'))`).run(jobId, originalName, req.file.size, resultJson);
    } catch (dbErr) {
      console.warn('[upload] doc_results persist failed:', dbErr);
    }

    res.status(201).json({
      id: jobId,
      filename: originalName,
      size: req.file.size,
      status: hasErrors ? 'error' : 'parsed',
      warnings,
      result,
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
  const filePath = path.join(UPLOAD_DIR, req.params.id);
  const fileStat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

  if (job) {
    res.json({
      id: req.params.id,
      status: 'parsed',
      progress: 100,
      filename: job.filename,
      fileSize: fileStat?.size || job.size,
      result: job.result,
      progressStage: job.progress,
      progressText: job.progressText,
    });
    return;
  }

  // 回落：内存过期/服务重启后，从 doc_results 恢复结果
  try {
    const row = db.prepare('SELECT result_json, filename, file_size FROM doc_results WHERE id = ?').get(req.params.id) as any;
    if (row) {
      res.json({
        id: req.params.id,
        status: 'parsed',
        progress: 100,
        filename: row.filename,
        fileSize: fileStat?.size || row.file_size,
        result: JSON.parse(row.result_json),
      });
      return;
    }
  } catch {}
  res.status(404).json({ error: 'Job not found' });
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
  const name = req.params.filename;
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || path.basename(name) !== name) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }
  const filePath = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.sendFile(filePath);
});

// ── 导出结果 ─────────────────────────────────────────────────────
router.get('/export/:jobId', (req, res) => {
  const { jobId } = req.params;
  const format = (req.query.format as string) || 'json';

  // Try jobStore first (recent), then DB
  const job = jobStore.get(jobId);
  let result: ExtractOutput | undefined;
  let filename = '';

  if (job) {
    result = job.result;
    filename = job.filename;
  } else {
    // Look up in doc_results
    try {
      const row = db.prepare('SELECT result_json, filename FROM doc_results WHERE id = ?').get(jobId) as any;
      if (row) {
        result = JSON.parse(row.result_json) as ExtractOutput;
        filename = row.filename;
      }
    } catch {}
  }

  if (!result) {
    return res.status(404).json({ error: '任务结果不存在，可能已过期（>1小时）' });
  }

  const safeFilename = (filename || 'extract-result').replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.json"`);
    res.json(result);
  } else if (format === 'markdown') {
    const md = buildMarkdownExport(result);
    res.setHeader('Content-Type', 'text/markdown;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.md"`);
    res.send(md);
  } else if (format === 'docx') {
    // 后端 docx 导出尚未实现：前端已通过模板生成 docx，此处如被直调则明确报错，
    // 绝不返回损坏的空文件。
    res.status(501).json({ error: '后端 docx 导出尚未实现，请使用页面导出功能' });
  } else {
    res.status(400).json({ error: `不支持的格式: ${format}，支持: json, markdown` });
  }
});

function buildMarkdownExport(result: ExtractOutput): string {
  const lines: string[] = [];
  lines.push(`# 招标文件提取结果\n`);
  lines.push(`**文件名：** ${result.fileMeta.fileName}\n`);
  lines.push(`**抽取模式：** ${result.extractMode}\n`);
  lines.push(`**提取时间：** ${result.fileMeta.parseTime}\n`);
  lines.push(`---\n`);

  const groupNames: Record<string, string> = {
    info: '项目信息', business: '商务条款', tech: '技术条款',
    score: '评分标准', seal: '封标信息', star: '标星条款',
  };

  const sortedKeys = Object.keys(result.extractResult || {}).sort();
  let currentGroup = '';
  for (const key of sortedKeys) {
    const val = result.extractResult[key];
    const group = result.fieldGroups?.[key] || val?.group || '';
    if (group !== currentGroup) {
      currentGroup = group;
      lines.push(`\n## ${groupNames[group] || group}\n`);
    }
    if (val?.value) {
      lines.push(`- **${key}**：${val.value}`);
      if (val.page) lines.push(`  - 溯源：第 ${val.page} 页 · ${val.chapter || ''}`);
      lines.push('');
    }
  }

  if (result.markedItems?.length) {
    lines.push('\n## 标星条款 ★\n');
    for (const item of result.markedItems) {
      lines.push(`- [${item.symbol}] 第${item.page}页：${item.text}\n`);
    }
  }

  return lines.join('\n');
}

export default router;
