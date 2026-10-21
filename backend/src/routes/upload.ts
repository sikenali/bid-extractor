import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseDocument } from '../services/docProcessor.js';
import type { ExtractOutput } from '../services/docProcessor.js';
import { db } from '../database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const ALLOWED_EXTS = ['.docx', '.pdf', '.md', '.txt', '.xlsx', '.csv', '.html'];

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

const upload = multer({
  storage: multer.memoryStorage(),
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
      // 清理磁盘文件
      const fp = (entry as any).filePath as string | undefined;
      if (fp && fs.existsSync(fp)) {
        try { fs.unlinkSync(fp); } catch {}
      }
      jobStore.delete(key);
    }
  }
}

// Periodic cleanup: jobs every 10 min
setInterval(cleanupExpiredJobs, 10 * 60 * 1000);

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // 检查是否配置了大模型：有启用且非空的 api_key 则视为已配置
  const modelCheck = db.prepare(
    'SELECT COUNT(*) as cnt FROM api_configs WHERE enabled = 1 AND api_key IS NOT NULL AND api_key != ""'
  ).get() as { cnt: number };
  const modelConfigured = (modelCheck?.cnt ?? 0) > 0;

  const skillId = req.body?.skill_id as string | undefined;
  // 如果前端未传 skillId 但模型已配置，自动获取所有启用的技能 ID 列表
  const rawSkillId = skillId || '';
  const effectiveSkillIds = !rawSkillId && modelConfigured
    ? (db.prepare('SELECT id FROM tender_llm_skill WHERE enable = 1 AND enable_llm = 1').all() as any[])
        .map((s: any) => s.id)
    : rawSkillId
      ? [rawSkillId]
      : [];

  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const jobId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    const result = await parseDocument(req.file.buffer, { skillIds: effectiveSkillIds, filename: originalName });
    const warnings = result.fileMeta?.warningList || [];

    // 补充命中率低的分组信息到 warnings
    const extractStats: Record<string, { hit: number; total: number }> = {};
    for (const [field, extract] of Object.entries(result.extracts || {})) {
      const g = result.fieldGroups?.[field] || extract?.group || 'info';
      if (!extractStats[g]) extractStats[g] = { hit: 0, total: 0 };
      extractStats[g].total++;
      if (extract?.value) extractStats[g].hit++;
    }
    const lowHitGroups = Object.entries(extractStats).filter(([_, s]) => s.total > 0 && s.hit / s.total < 0.5);
    if (lowHitGroups.length > 0) {
      for (const [g, s] of lowHitGroups) {
        const labels: Record<string, string> = { info: '项目信息', business: '商务条款', tech: '技术条款', score: '评分标准', seal: '封标信息', star: '标星条款' };
        warnings.push(`【${labels[g] || g}】命中率 ${Math.round(s.hit/s.total*100)}%（${s.hit}/${s.total}），建议开启 LLM 增强`);
      }
    }
    const hasErrors = warnings.some(w => w.includes('失败') || w.includes('不支持') || w.includes('不存在'));

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
        virtualTables: result.virtualTables || [],
        chapters: result.chapters || [],
        documentStructure: result.documentStructure || [],
        paraToPage: result.paraToPage || [],
        paragraphsMeta: result.paragraphsMeta || [],
        tables: result.tables || [],
      });
      db.prepare(`INSERT INTO doc_results (id, filename, file_size, result_json, created_at)
                  VALUES (?, ?, ?, ?, datetime('now'))`).run(jobId, originalName, req.file.size, resultJson);
    } catch (dbErr) {
      console.warn('[upload] doc_results persist failed:', dbErr);
    }

    // 持久化原始文件到磁盘，供预览使用
    try {
      const ext = path.extname(originalName).toLowerCase();
      const safeName = jobId + ext;
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, req.file.buffer);
      (jobStore.get(jobId) as any).filePath = filePath;
    } catch (fsErr) {
      console.warn('[upload] file persist failed:', fsErr);
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
    res.status(500).json({ error: err.message || '解析过程中发生错误' });
  }
});

router.get('/:id/status', (req, res) => {
  const job = jobStore.get(req.params.id);

  if (job) {
    res.json({
      id: req.params.id,
      status: 'parsed',
      progress: 100,
      filename: job.filename,
      fileSize: job.size,
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
        fileSize: row.file_size,
        result: JSON.parse(row.result_json),
        progressStage: 3,
        progressText: '已完成',
      });
      return;
    }
  } catch {}
  res.status(404).json({ error: 'Job not found' });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const job = jobStore.get(id);
  if (job) {
    // 清理磁盘上的上传文件
    const fp = (job as any).filePath as string | undefined;
    if (fp && fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch {}
    }
    jobStore.delete(id);
  }
  // 清理磁盘文件（fallback，应对 jobStore 已过期情况）
  for (const ext of ALLOWED_EXTS) {
    const fp = path.join(UPLOADS_DIR, id + ext);
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch {}
    }
  }
  // 清理 DB 中对应的结果记录
  try { db.prepare('DELETE FROM doc_results WHERE id = ?').run(id); } catch {}
  res.json({ deleted: true });
});

// ── 文件预览：返回原始上传文件 ───────────────────────────────────────
router.get('/file/:fileKey', (req, res) => {
  const { fileKey } = req.params;

  // 安全校验：防止路径遍历
  const safeKey = path.basename(fileKey);
  if (safeKey !== fileKey) {
    res.status(400).json({ error: '非法文件标识' });
    return;
  }
  if (/^[a-zA-Z0-9\-_.]+$/.test(safeKey) === false) {
    res.status(400).json({ error: '非法文件标识' });
    return;
  }

  // 优先从内存 jobStore 查找（含 filePath 字段）
  const job = jobStore.get(fileKey);
  if (job && (job as any).filePath && fs.existsSync((job as any).filePath)) {
    const filePath = path.resolve((job as any).filePath as string);
    if (!filePath.startsWith(path.resolve(UPLOADS_DIR) + path.sep) && filePath !== path.resolve(UPLOADS_DIR)) {
      res.status(403).json({ error: '禁止访问' });
      return;
    }
    const ext = path.extname(filePath);
    const mimeTypeMap: Record<string, string> = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf':  'application/pdf',
      '.md':   'text/markdown',
      '.txt':  'text/plain',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv':  'text/csv',
      '.html': 'text/html',
    };
    res.setHeader('Content-Type', mimeTypeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
    res.sendFile(filePath);
    return;
  }

  // 回落：从磁盘 uploads 目录按 jobId+ext 查找
  for (const ext of ALLOWED_EXTS) {
    const resolvedPath = path.resolve(path.join(UPLOADS_DIR, safeKey + ext));
    if (!resolvedPath.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      continue;
    }
    if (fs.existsSync(resolvedPath)) {
      const mimeTypeMap: Record<string, string> = {
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.pdf':  'application/pdf',
        '.md':   'text/markdown',
        '.txt':  'text/plain',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv':  'text/csv',
        '.html': 'text/html',
      };
      res.setHeader('Content-Type', mimeTypeMap[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeKey + ext)}"`);
      res.sendFile(resolvedPath);
      return;
    }
  }

  res.status(404).json({ error: '文件不存在' });
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

  // 虚拟表格（文字描述解析）
  if (result.virtualTables?.length) {
    lines.push('\n## 解析表格（文字描述）\n');
    for (const vt of result.virtualTables) {
      lines.push(`### 表格 · 第${vt.page}页 · ${vt.group}\n`);
      for (const row of vt.rows) {
        lines.push('| ' + row.map(c => c.replace(/\|/g, '\\|')).join(' | ') + ' |\n');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export default router;
