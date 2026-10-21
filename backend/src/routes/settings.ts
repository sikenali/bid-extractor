import { Router } from 'express';
import crypto from 'node:crypto';
import { db, encrypt, decrypt } from '../database.js';
import https from 'node:https';
import http from 'node:http';

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
  const configs = db.prepare('SELECT * FROM api_configs').all();
  const masked = configs.map((c: any) => ({
    ...c,
    api_key: c.api_key ? c.api_key.slice(0, 4) + '••••' + c.api_key.slice(-4) : '••••',
  }));
  res.json(masked);
});

router.post('/apikeys', (req, res) => {
  const { provider, model, api_key, region, base_url } = req.body;
  const id = crypto.randomUUID();
  const encryptedKey = api_key ? encrypt(api_key) : '';
  db.prepare('INSERT INTO api_configs (id, provider, model, api_key, region, base_url, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)').run(id, provider, model, encryptedKey, region, base_url);
  res.status(201).json({ id, provider, model, region, base_url });
});

router.delete('/apikeys/:id', (req, res) => {
  const result = db.prepare('DELETE FROM api_configs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ deleted: true });
});

router.put('/apikeys/:id', (req, res) => {
  const { provider, model, api_key, region, base_url, enabled } = req.body;
  const existing = db.prepare('SELECT * FROM api_configs WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  // 未传新密钥时保留原加密密钥，避免误清空
  const encryptedKey = api_key ? encrypt(api_key) : existing.api_key;
  db.prepare(`UPDATE api_configs SET provider=?, model=?, api_key=?, region=?, base_url=?, enabled=? WHERE id=?`).run(
    provider ?? existing.provider,
    model ?? existing.model,
    encryptedKey,
    region ?? existing.region,
    base_url ?? existing.base_url,
    enabled ?? existing.enabled ?? 1,
    req.params.id
  );
  res.json({ ok: true });
});

router.put('/apikeys/:id/toggle', (req, res) => {
  const row = db.prepare('SELECT enabled FROM api_configs WHERE id = ?').get(req.params.id) as { enabled: number } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  const newEnabled = row.enabled ? 0 : 1;
  db.prepare('UPDATE api_configs SET enabled = ? WHERE id = ?').run(newEnabled, req.params.id);
  res.json({ enabled: newEnabled });
});

// Test API key connectivity
router.post('/test-key', (req, res) => {
  const { id, provider, model, key, endpoint, format } = req.body;

  let realKey = key;
  let realProvider = provider;
  let realModel = model;
  let realEndpoint = endpoint;
  let realFormat = format;

  // 已保存的密钥：按 id 读取并解密
  if (id) {
    const row = db.prepare('SELECT * FROM api_configs WHERE id = ?').get(id) as any;
    if (!row) {
      res.status(404).json({ available: false, error: '未找到该密钥配置' });
      return;
    }
    try {
      realKey = decrypt(row.api_key);
    } catch {
      res.status(400).json({ available: false, error: '密钥解密失败，请重新保存' });
      return;
    }
    realProvider = row.provider;
    realModel = row.model;
    realEndpoint = row.base_url || undefined;
    realFormat = (row as any).format || 'openai';
  }

  if (!realKey || !realModel) {
    res.status(400).json({ available: false, error: 'key and model are required' });
    return;
  }

  const timeout = 8000;
  const url = realEndpoint ? normalizeEndpoint(realEndpoint) : getDefaultBaseURL(realProvider);
  const isAnthropic = realFormat === 'anthropic' || String(realProvider).toLowerCase().includes('anthropic');

  const testUrl = isAnthropic
    ? new URL('/v1/messages', url)
    : new URL('/v1/models', url);

  const proto = testUrl.protocol === 'https:' ? https : http;

  const options: any = {
    hostname: testUrl.hostname,
    port: testUrl.port || (testUrl.protocol === 'https:' ? 443 : 80),
    path: testUrl.pathname + testUrl.search,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${realKey}`,
      'Content-Type': 'application/json',
    },
    timeout,
  };

  const reqObj = proto.request(options, (response) => {
    let data = '';
    response.on('data', (chunk: string) => { data += chunk; });
    response.on('end', () => {
      if (response.statusCode === 200) {
        res.json({ available: true });
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        res.json({ available: false, error: 'API key 无效' });
      } else if (response.statusCode === 404 && !isAnthropic) {
        // Models endpoint not found, try a minimal chat completion
        testChatCompletion(url, realKey, realModel, isAnthropic, (result) => {
          res.json(result);
        });
      } else {
        res.json({ available: false, error: `HTTP ${response.statusCode}` });
      }
    });
  });

  reqObj.on('error', (err: any) => {
    res.json({ available: false, error: `连接失败: ${err.message}` });
  });

  reqObj.setTimeout(timeout, () => {
    reqObj.destroy();
    res.json({ available: false, error: '请求超时' });
  });

  reqObj.end();
});

function testChatCompletion(baseUrl: string, key: string, model: string, isAnthropic: boolean, cb: (result: { available: boolean; error?: string }) => void) {
  const urlObj = new URL(isAnthropic ? '/v1/messages' : '/v1/chat/completions', baseUrl);
  const proto = urlObj.protocol === 'https:' ? https : http;

  const body = isAnthropic
    ? JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] })
    : JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 });

  const options: any = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 8000,
  };

  const reqObj = proto.request(options, (response) => {
    let data = '';
    response.on('data', (chunk: string) => { data += chunk; });
    response.on('end', () => {
      if (response.statusCode === 200) {
        cb({ available: true });
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        cb({ available: false, error: 'API key 无效' });
      } else {
        cb({ available: false, error: `HTTP ${response.statusCode}` });
      }
    });
  });

  reqObj.on('error', (err: any) => {
    cb({ available: false, error: `连接失败: ${err.message}` });
  });

  reqObj.setTimeout(8000, () => {
    reqObj.destroy();
    cb({ available: false, error: '请求超时' });
  });

  reqObj.write(body);
  reqObj.end();
}

function getDefaultBaseURL(provider: string): string {
  const map: Record<string, string> = {
    '阿里云': 'https://dashscope.aliyuncs.com',
    '百度': 'https://aip.baidubce.com',
    '智谱': 'https://open.bigmodel.cn',
    'OpenAI': 'https://api.openai.com',
    'Anthropic': 'https://api.anthropic.com',
    'DeepSeek': 'https://api.deepseek.com',
    'Moonshot': 'https://api.moonshot.cn',
    'Google': 'https://generativelanguage.googleapis.com',
    'Mistral': 'https://api.mistral.ai',
    'Groq': 'https://api.groq.com',
  };
  return map[provider] || 'https://api.openai.com';
}

function normalizeEndpoint(ep: string): string {
  ep = ep.replace(/\/chat\/completions$/, '').replace(/\/messages$/, '').replace(/\/v1\/$/, '');
  return ep.replace(/\/$/, '') || ep;
}

// ── Templates ───────────────────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  { id: 'tpl-1', name: '商务标 · 通用章节模板', description: '含投标函、授权委托书、工程量清单等 12 个章节', category: '商务标', type: 'bidding' },
  { id: 'tpl-2', name: '技术标 · 施工组织设计模板', description: '覆盖施工方案、进度计划、质量与安全保障措施', category: '技术标', type: 'bidding' },
  { id: 'tpl-3', name: '资格标 · 资质业绩模板', description: '营业执照、资质证书、类似项目业绩汇总表', category: '资格标', type: 'bidding' },
  { id: 'tpl-4', name: '报价标 · 清单报价模板', description: '分部分项、措施项目、规费税金标准表式', category: '报价标', type: 'bidding' },
  { id: 'tpl-5', name: '封面目录 · 标书装帧模板', description: '统一封面、目录、页眉页脚与装订顺序', category: '排版', type: 'custom' },
  { id: 'tpl-6', name: '承诺函 · 合规声明模板', description: '廉政承诺、质保承诺、售后服务承诺标准文案', category: '合规', type: 'custom' },
];

function seedTemplates() {
  try {
    const existing = db.prepare('SELECT COUNT(*) as c FROM templates').get() as { c: number };
    if (existing.c > 0) return;
    const stmt = db.prepare('INSERT OR IGNORE INTO templates (id, name, description, category, type) VALUES (?, ?, ?, ?, ?)');
    for (const t of DEFAULT_TEMPLATES) stmt.run(t.id, t.name, t.description, t.category, t.type);
  } catch { /* templates table not yet created */ }
}
// 由 index.ts 在 initializeDatabase() 后调用
export function bootSeedTemplates() { seedTemplates(); }

router.get('/templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();
  res.json({ templates: rows });
});

router.post('/templates', (req, res) => {
  const { name, description, category, type } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const id = `tpl-${Date.now()}`;
  db.prepare('INSERT INTO templates (id, name, description, category, type) VALUES (?, ?, ?, ?, ?)').run(
    id, name, description || '', category || '自定义', type || 'custom'
  );
  res.status(201).json({ id, name, description, category, type });
});

router.delete('/templates/:id', (req, res) => {
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ deleted: true });
});

router.put('/templates/:id', (req, res) => {
  const { name, description, category, enabled } = req.body;
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('UPDATE templates SET name=?, description=?, category=?, enabled=? WHERE id=?').run(
    name ?? row.name,
    description ?? row.description,
    category ?? row.category,
    enabled ?? row.enabled ?? 1,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id));
});

router.post('/templates/reset', (_req, res) => {
  db.prepare('DELETE FROM templates').run();
  const stmt = db.prepare('INSERT OR IGNORE INTO templates (id, name, description, category, type, enabled) VALUES (?, ?, ?, ?, ?, 1)');
  for (const t of DEFAULT_TEMPLATES) stmt.run(t.id, t.name, t.description, t.category, t.type);
  res.json({ templates: db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all() });
});

// ── Profile Settings ────────────────────────────────────────────
router.get('/profile', (_req, res) => {
  const row = db.prepare('SELECT * FROM profile_settings WHERE id = 1').get() as any;
  res.json(row || { id: 1, auto_redirect_after_extract: 1, default_skill_id: '', extract_preview_mode: 'list' });
});

router.put('/profile', (req, res) => {
  const { auto_redirect_after_extract, default_skill_id, extract_preview_mode } = req.body;
  const existing = db.prepare('SELECT id FROM profile_settings WHERE id = 1').get() as any;
  if (existing) {
    db.prepare(`UPDATE profile_settings SET
      auto_redirect_after_extract = COALESCE(?, auto_redirect_after_extract),
      default_skill_id = COALESCE(?, default_skill_id),
      extract_preview_mode = COALESCE(?, extract_preview_mode)
    WHERE id = 1`).run(
      auto_redirect_after_extract !== undefined ? auto_redirect_after_extract : undefined,
      default_skill_id,
      extract_preview_mode,
    );
  } else {
    db.prepare(`INSERT INTO profile_settings (id, auto_redirect_after_extract, default_skill_id, extract_preview_mode)
      VALUES (1, COALESCE(?, 1), COALESCE(?, ''), COALESCE(?, 'list'))`).run(
      auto_redirect_after_extract !== undefined ? auto_redirect_after_extract : 1,
      default_skill_id,
      extract_preview_mode,
    );
  }
  const row = db.prepare('SELECT * FROM profile_settings WHERE id = 1').get();
  res.json(row);
});

// 获取 LLM 模型配置状态（是否有启用的 API key）
router.get('/model-config', (_req, res) => {
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM api_configs WHERE enabled = 1 AND api_key IS NOT NULL AND api_key != ""'
  ).get() as { cnt: number };
  res.json({ modelConfigured: (row?.cnt ?? 0) > 0 });
});

// LLM Enhance config
router.get('/llm-enhance', (_req, res) => {
  const row = db.prepare(
    'SELECT llm_enhance_enabled, llm_hit_rate_threshold, llm_model_id FROM profile_settings WHERE id = 1'
  ).get() as any;

  res.json({
    enabled: (row?.llm_enhance_enabled ?? 1) === 1,
    hitRateThreshold: row?.llm_hit_rate_threshold ?? 0.6,
    modelId: row?.llm_model_id ?? '',
  });
});

router.put('/llm-enhance', (req, res) => {
  const { enabled, hitRateThreshold, modelId } = req.body;

  const existing = db.prepare('SELECT id FROM profile_settings WHERE id = 1').get() as any;
  if (existing) {
    db.prepare(`UPDATE profile_settings SET
      llm_enhance_enabled = COALESCE(?, llm_enhance_enabled),
      llm_hit_rate_threshold = COALESCE(?, llm_hit_rate_threshold),
      llm_model_id = COALESCE(?, llm_model_id)
    WHERE id = 1`).run(
      enabled != null ? (enabled ? 1 : 0) : null,
      hitRateThreshold ?? null,
      modelId ?? null,
    );
  } else {
    db.prepare(`INSERT OR IGNORE INTO profile_settings (id, llm_enhance_enabled, llm_hit_rate_threshold, llm_model_id)
      VALUES (1, ?, ?, ?)`).run(
      enabled != null ? (enabled ? 1 : 0) : 1,
      hitRateThreshold ?? 0.6,
      modelId ?? '',
    );
  }

  res.json({ success: true });
});

export default router;
