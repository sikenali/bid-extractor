import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../database.js';

const router = Router();

// ── GET /api/llm-prompts — list all templates ───────────────────────
router.get('/', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, name, description, biz_type, template_text, variables, enable, version, created_at, updated_at FROM llm_prompt_templates ORDER BY created_at DESC'
  ).all();
  res.json(rows);
});

// ── GET /api/llm-prompts/:id — single template ──────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM llm_prompt_templates WHERE id = ?'
  ).get(req.params.id) as any;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
});

// ── POST /api/llm-prompts — create ──────────────────────────────────
router.post('/', (req, res) => {
  const { name, description, biz_type, template_text, variables } = req.body;
  if (!name || !template_text) {
    res.status(400).json({ error: 'name and template_text are required' });
    return;
  }
  const id = `prompt_${crypto.randomUUID()}`;
  const varsJson = Array.isArray(variables)
    ? JSON.stringify(variables)
    : (variables ?? '[]');
  db.prepare(
    'INSERT INTO llm_prompt_templates (id, name, description, biz_type, template_text, variables, enable) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(id, name, description || '', biz_type || 'info', template_text, varsJson);
  const row = db.prepare('SELECT * FROM llm_prompt_templates WHERE id = ?').get(id);
  res.status(201).json(row);
});

// ── PUT /api/llm-prompts/:id — update ───────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM llm_prompt_templates WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const { name, description, biz_type, template_text, variables, enable } = req.body;
  db.prepare(
    `UPDATE llm_prompt_templates SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      biz_type = COALESCE(?, biz_type),
      template_text = COALESCE(?, template_text),
      variables = COALESCE(?, variables),
      enable = COALESCE(?, enable),
      version = version + 1,
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(name, description, biz_type, template_text,
    Array.isArray(variables) ? JSON.stringify(variables) : variables,
    enable !== undefined ? enable : undefined,
    req.params.id);
  const row = db.prepare('SELECT * FROM llm_prompt_templates WHERE id = ?').get(req.params.id);
  res.json(row);
});

// ── DELETE /api/llm-prompts/:id — delete ────────────────────────────
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM llm_prompt_templates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ deleted: true });
});

// ── POST /api/llm-prompts/test — test a template against sample text ─
router.post('/test', (req, res) => {
  const { id, sampleText } = req.body;
  if (!id || !sampleText) {
    res.status(400).json({ error: 'id and sampleText are required' });
    return;
  }
  const tpl = db.prepare('SELECT * FROM llm_prompt_templates WHERE id = ?').get(id) as any;
  if (!tpl) { res.status(404).json({ error: 'Template not found' }); return; }
  // Return template with variable placeholders highlighted
  const rendered = tpl.template_text
    .replace(/\{\{(\w+)\}\}/g, '<mark>$1</mark>');
  res.json({
    id: tpl.id,
    name: tpl.name,
    templateText: tpl.template_text,
    renderedTemplate: rendered,
    sampleText: sampleText.slice(0, 500),
    variables: tpl.variables ? JSON.parse(tpl.variables) : [],
  });
});

// ── POST /api/llm-prompts/reset — reset to defaults ─────────────────
router.post('/reset', (_req, res) => {
  db.prepare('DELETE FROM llm_prompt_templates').run();
  const defaults = [
    ['prompt_info', '项目信息抽取提示词', 'info',
      '你是招标文件抽取专家。根据以下章节原文，提取【项目信息】字段。\n字段：项目名称、项目编号、采购方式、预算金额、投标截止时间、开标时间、投标地点、采购人、采购代理、资金来源。\n要求：1. 严格保留原文；2. 无该字段填空字符串""；3. 仅输出JSON，禁止其他文字。\n原文片段：\n{{chunkText}}', []],
    ['prompt_business', '商务条款抽取提示词', 'business',
      '你是招标文件抽取专家。根据以下章节原文，提取【商务条款】字段。\n字段：付款方式、质保期、履约保证金、交货期、投标有效期、联合体要求、分包转包要求、中小企业要求。\n要求：1. 严格保留原文；2. 否决投标（废标）条款逐条拆分；3. 仅输出JSON。\n原文片段：\n{{chunkText}}', []],
    ['prompt_tech', '技术条款抽取提示词', 'tech',
      '你是招标文件抽取专家。根据以下章节原文，提取【技术条款】字段。\n字段：技术规格、技术参数、性能要求、验收标准、服务要求、配置清单。\n要求：1. 严格保留原文；2. 仅输出JSON。\n原文片段：\n{{chunkText}}', []],
    ['prompt_score', '评分标准抽取提示词', 'score',
      '你是招标文件抽取专家。根据以下章节原文，提取【评分标准】字段。\n字段：评标办法、价格评分分值、技术评分分值、商务评分分值、满分值、评分细则。\n要求：1. 分值数值必须准确；2. 总分校验；3. 仅输出JSON。\n原文片段：\n{{chunkText}}', []],
    ['prompt_seal', '封标信息抽取提示词', 'seal',
      '你是招标文件抽取专家。根据以下章节原文，提取【封标信息】字段。\n字段：密封要求、正本份数、副本份数、电子标书要求、递交地点、封套标注要求。\n要求：1. 保留原文；2. 仅输出JSON。\n原文片段：\n{{chunkText}}', []],
    ['prompt_star', '标星条款抽取提示词', 'star',
      '你是招标文件抽取专家。根据以下章节原文，提取【标星条款★】。\n要求：1. 带★或▲等符号的强制关键条款，漏召回是重大风险；2. 逐条拆分保留原文；3. 仅输出JSON。\n原文片段：\n{{chunkText}}', []],
  ];
  const stmt = db.prepare(
    'INSERT INTO llm_prompt_templates (id, name, description, biz_type, template_text, variables, enable) VALUES (?, ?, ?, ?, ?, ?, 1)'
  );
  for (const d of defaults) stmt.run(...d);
  const rows = db.prepare('SELECT * FROM llm_prompt_templates ORDER BY created_at').all();
  res.json({ ok: true, count: rows.length });
});

export default router;
