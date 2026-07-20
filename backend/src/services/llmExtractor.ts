import axios from 'axios';
import { db, decrypt } from '../database.js';

// ── Types ──────────────────────────────────────────────────────────

export interface LlmSettings {
  enabled: boolean;
  provider: string;
  maxDocChars: number;
  timeoutSeconds: number;
}

export interface RefineResult {
  success: boolean;
  fieldsExtracted: number;
  totalFields: number;
  source: 'llm' | 'fallback';
  error?: string;
  merged?: Record<string, unknown>;
  llmFields?: Record<string, 'llm'>;
}

interface ApiKeyRecord {
  id: string;
  provider: string;
  model: string;
  api_key: string;
  region?: string;
  base_url?: string;
}

interface LlmFieldDef {
  fieldName: string;
  description: string;
}

// ── Queue ──────────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
let concurrentCount = 0;
const queue: Array<{
  jobId: string;
  result: any;
  resolve: (r: RefineResult) => void;
  reject: (e: Error) => void;
}> = [];

function queueRunner(): void {
  if (queue.length === 0 || concurrentCount >= MAX_CONCURRENT) return;
  concurrentCount++;
  const { jobId, result, resolve, reject } = queue.shift()!;
  refineJobInternal(jobId, result)
    .then(resolve)
    .catch(reject)
    .finally(() => {
      concurrentCount--;
      queueRunner();
    });
}

// ── Settings ───────────────────────────────────────────────────────

export function getLlmSettings(): LlmSettings {
  const row = db.prepare('SELECT * FROM llm_enhance_settings WHERE id = 1').get() as any;
  return {
    enabled: !!row?.enabled,
    provider: row?.provider || 'qwen-turbo',
    maxDocChars: row?.max_doc_chars || 32000,
    timeoutSeconds: row?.timeout_seconds || 60,
  };
}

export function updateLlmSettings(partial: Partial<LlmSettings>): LlmSettings {
  const updates: string[] = [];
  const values: any[] = [];

  if (partial.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(partial.enabled ? 1 : 0);
  }
  if (partial.provider !== undefined) {
    updates.push('provider = ?');
    values.push(partial.provider);
  }
  if (partial.maxDocChars !== undefined) {
    updates.push('max_doc_chars = ?');
    values.push(partial.maxDocChars);
  }
  if (partial.timeoutSeconds !== undefined) {
    updates.push('timeout_seconds = ?');
    values.push(partial.timeoutSeconds);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(1);
    db.prepare(`UPDATE llm_enhance_settings SET ${updates.join(', ')} WHERE id = 1`).run(...values);
  }

  return getLlmSettings();
}

export function getLlmStatus(): { available: boolean; enabled: boolean; hasApiKey: boolean } {
  const settings = getLlmSettings();
  if (!settings.enabled) return { available: false, enabled: false, hasApiKey: false };

  const keys = db.prepare('SELECT id FROM api_configs LIMIT 1').all();
  const hasApiKey = keys.length > 0;

  return {
    available: hasApiKey,
    enabled: settings.enabled,
    hasApiKey,
  };
}

// ── Field identification ───────────────────────────────────────────

function getExtractionFields(): LlmFieldDef[] {
  const rules = db.prepare(
    "SELECT field_name, group_name FROM extraction_rules WHERE enabled = 1 AND category = 'regex'"
  ).all() as Array<{ field_name: string; group_name: string }>;

  const descriptions: Record<string, string> = {
    info_project_name: '项目名称',
    info_project_code: '项目编号',
    info_bid_deadline: '投标截止时间',
    info_bid_location: '投标地点',
    info_delivery_time_1: '交付时间',
    info_delivery_time_2: '交付时间',
    info_delivery_location: '交付地点',
    info_bid_bond_1: '投标保证金',
    info_procurement_method: '采购方式',
    info_budget: '预算金额',
    info_purchaser: '采购人',
    info_agent: '采购代理',
    info_funding_source: '资金来源',
    info_open_time: '开标时间',
    info_site_visit: '踏勘时间',
    info_subcontract: '分包情况',
    info_contract_package: '合同包号',
    info_procurement_need: '采购需求',
    business_payment: '付款方式',
    business_warranty: '质保期',
    business_performance_bond: '履约保证金',
    business_delivery_period: '交货期',
    business_bid_validity: '投标有效期',
    business_contract_signing: '合同签订',
    business_license: '营业执照',
    business_financial: '财务要求',
    business_tax: '纳税要求',
    business_social_security: '社会保障',
    business_credit: '信用记录',
    business_consortium: '联合体',
    business_subcontracting: '分包转包',
    business_sme: '中小企业',
    business_project_manager: '项目管理人员',
    tech_spec: '技术规格',
    tech_perf: '性能要求',
    tech_acceptance: '验收标准',
    tech_service_content: '服务内容',
    tech_service_req: '服务要求',
    tech_training: '培训要求',
    score_table: '评分表',
    score_item: '评分项',
    score_price: '价格评分',
    score_tech: '技术评分',
    score_business: '商务评分',
    score_points: '分值',
    score_full: '满分',
    score_pass: '合格分数线',
    score_factors: '评审因素',
    seal_keyword_bid_seal: '废标',
    seal_keyword_invalid_bid: '无效投标',
    seal_keyword_substantial: '实质性响应',
    seal_keyword_star_clause: '★号条款',
    seal_keyword_reject: '否决投标',
  };

  return rules.map(r => ({
    fieldName: r.field_name,
    description: descriptions[r.field_name] || r.field_name,
  }));
}

function identifyMissingFields(
  extracts: Record<string, unknown>,
  fieldDefs: LlmFieldDef[]
): LlmFieldDef[] {
  const MISSING_THRESHOLD = 5; // chars below which we consider it "low confidence"

  return fieldDefs.filter(f => {
    const raw = extracts[f.fieldName];
    if (raw === undefined || raw === null || raw === '') return true;
    const str = String(raw).trim();
    if (str.length < MISSING_THRESHOLD) return true;
    // Skip if it looks like a regex artifact (single digit, random chars)
    if (/^\d$/.test(str)) return true;
    return false;
  });
}

// ── Token estimation ───────────────────────────────────────────────

function estimateTokens(text: string): number {
  const cnChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const otherChars = text.length - cnChars;
  return Math.ceil(cnChars * 1.5 + otherChars * 0.25);
}

// ── Document text preparation ──────────────────────────────────────

function prepareDocumentText(fullText: string, maxChars: number): string {
  if (!fullText || fullText.length <= maxChars) return fullText;

  // For long documents, try to extract key sections
  const sections = splitIntoSections(fullText);
  const priorityWeights: Record<string, number> = {
    '招标公告': 10,
    '项目概况': 9,
    '采购内容': 8,
    '投标人资格': 7,
    '资格要求': 7,
    '招标范围': 6,
    '合同条款': 5,
    '评分标准': 5,
    '评分办法': 5,
    '评标办法': 5,
    '投标须知': 4,
    '递交': 4,
    '开标': 3,
    '开标时间': 3,
    '投标截止': 3,
  };

  const scored = sections.map(s => ({
    title: s.title,
    weight: priorityWeights[s.title] || 1,
    length: s.content.length,
    content: s.content,
  }));

  // Sort by weight desc, then by length desc
  scored.sort((a, b) => b.weight - a.weight || b.length - a.length);

  let result = '';
  let remaining = maxChars;

  // First pass: include high-priority sections
  for (const s of scored) {
    if (remaining <= 0) break;
    const header = `\n\n=== ${s.title} ===\n`;
    const take = Math.min(remaining - header.length, s.content.length);
    if (take > 0) {
      result += header + s.content.substring(0, take);
      remaining -= header.length + take;
    }
  }

  // Second pass: fill remaining with low-priority content
  if (remaining > 0) {
    for (const s of scored) {
      if (remaining <= 0) break;
      const header = `\n\n=== ${s.title} (续) ===\n`;
      const startIdx = result.includes(`=== ${s.title} ===`)
        ? result.indexOf(`=== ${s.title} ===`) + (`=== ${s.title} ===`.length)
        : 0;
      const usedInSection = result.substring(startIdx).length;
      const remainingInSection = Math.max(0, s.content.length - usedInSection);
      const take = Math.min(remaining - header.length, remainingInSection);
      if (take > 0) {
        result += header + s.content.substring(usedInSection, usedInSection + take);
        remaining -= header.length + take;
      }
    }
  }

  return result;
}

interface Section {
  title: string;
  content: string;
}

function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [];
  // Split by common section markers
  const lines = text.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  const sectionPattern = /^(?:第[一二三四五六七八九十\d]+[章节部分]|§|#{1,3}\s|.{2,20}(?:要求|标准|条款|办法|须知|规定|说明|内容|范围|条件)[^.{0,10}]*[：:])/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;
    if (sectionPattern.test(trimmed) && trimmed.length < 50) {
      if (currentTitle && currentContent.length > 0) {
        sections.push({ title: currentTitle, content: currentContent.join('\n') });
      }
      currentTitle = trimmed;
      currentContent = [];
    } else {
      currentContent.push(trimmed);
    }
  }

  if (currentTitle && currentContent.length > 0) {
    sections.push({ title: currentTitle, content: currentContent.join('\n') });
  }

  if (sections.length === 0) {
    return [{ title: '全文', content: text }];
  }

  return sections;
}

// ── Prompt building ────────────────────────────────────────────────

function buildPrompt(missingFields: LlmFieldDef[], documentText: string): { system: string; user: string } {
  const fieldsList = missingFields
    .map((f, i) => `${i + 1}. ${f.fieldName} (${f.description}): ${f.description}`)
    .join('\n');

  const system =
    '你是一个专业的中文招标文件信息提取助手。你的任务是从招标文件中提取特定字段的信息。\n' +
    '请严格按照以下要求提取信息：\n' +
    '1. 保持原文表述，不要编造或推断不存在的内容\n' +
    '2. 如果某个字段在文档中找不到对应信息，请将该字段的值设为 null\n' +
    '3. 只返回要求的字段，不要添加额外字段\n' +
    '4. 输出必须是合法的 JSON 格式';

  const user =
    `请从以下招标文件文本中提取以下字段的信息：\n\n` +
    `【待提取字段】\n${fieldsList}\n\n` +
    `【文档内容】\n${documentText}\n\n` +
    `请以 JSON 格式返回提取结果，键名为字段名，值为提取到的原文内容。如果某字段无法提取，值为 null。\n\n` +
    `示例输出格式：\n` +
    `{\n` +
    `  "info_bid_deadline": "2026年8月15日14:00",\n` +
    `  "info_budget": null,\n` +
    `  ...\n` +
    `}\n`;

  return { system, user };
}

// ── LLM API call ───────────────────────────────────────────────────

async function callLLM(
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutSeconds: number
): Promise<string> {
  const url = baseUrl || getDefaultBaseUrl(model);
  const modelName = getModelName(model);

  const response = await axios.post(
    url,
    {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: timeoutSeconds * 1000,
      maxRedirects: 5,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty LLM response');
  return content;
}

function getDefaultBaseUrl(model: string): string {
  if (model.includes('qwen') || model.includes('dashscope')) return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  if (model.includes('gpt') || model.includes('openai')) return 'https://api.openai.com/v1/chat/completions';
  if (model.includes('claude')) return 'https://api.anthropic.com/v1/messages';
  if (model.includes('glm') || model.includes('zhipu')) return 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  if (model.includes('ernie') || model.includes('baidu')) return 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions';
  return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
}

function getModelName(configModel: string): string {
  // Normalize common config model names to actual API model names
  if (configModel.includes('qwen')) return 'qwen-turbo';
  if (configModel.includes('gpt')) return 'gpt-4o-mini';
  if (configModel.includes('claude')) return 'claude-3-5-sonnet-20241022';
  if (configModel.includes('glm')) return 'glm-4-flash';
  if (configModel.includes('ernie')) return 'ernie-lite';
  return configModel;
}

// ── Response parsing ───────────────────────────────────────────────

function parseLlmResponse(response: string): Record<string, unknown> {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(response);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* fall through */ }

  // Try to extract JSON from markdown code block
  const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Try to find JSON object in the response
  const objStart = response.indexOf('{');
  const objEnd = response.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    try {
      return JSON.parse(response.substring(objStart, objEnd + 1));
    } catch { /* fall through */ }
  }

  throw new Error('Cannot parse LLM response as JSON');
}

// ── Merge results ──────────────────────────────────────────────────

function mergeResults(
  originalExtracts: Record<string, unknown>,
  llmResults: Record<string, unknown>
): { merged: Record<string, unknown>; llmFields: Record<string, 'llm'> } {
  const merged = { ...originalExtracts };
  const llmFields: Record<string, 'llm'> = {};

  for (const [key, value] of Object.entries(llmResults)) {
    const originalValue = merged[key];
    const originalStr = originalValue ? String(originalValue).trim() : '';
    const llmStr = value ? String(value).trim() : '';

    // Only use LLM value if original was empty/very short
    if (!originalStr || originalStr.length < 5 || llmStr.length > originalStr.length) {
      if (llmStr) {
        merged[key] = llmStr;
        llmFields[key] = 'llm';
      }
    }
  }

  return { merged, llmFields };
}

// ── Core refinement ────────────────────────────────────────────────

export async function refineJob(
  jobId: string,
  result: any,
  onQueue?: () => void
): Promise<RefineResult> {
  const settings = getLlmSettings();
  if (!settings.enabled) {
    return { success: false, fieldsExtracted: 0, totalFields: 0, source: 'fallback', error: 'LLM enhancement not enabled' };
  }

  // Check if API key exists
  const keys = db.prepare('SELECT id FROM api_configs LIMIT 1').all();
  if (keys.length === 0) {
    return { success: false, fieldsExtracted: 0, totalFields: 0, source: 'fallback', error: 'No API keys configured' };
  }

  if (onQueue) onQueue();

  return new Promise<RefineResult>((resolve, reject) => {
    queue.push({ jobId, result, resolve, reject });
    queueRunner();
  });
}

async function refineJobInternal(
  jobId: string,
  result: any
): Promise<RefineResult> {
  try {
    const settings = getLlmSettings();
    const extracts = result.extracts as Record<string, unknown> || {};
    const fieldDefs = getExtractionFields();
    const missingFields = identifyMissingFields(extracts, fieldDefs);

    if (missingFields.length === 0) {
      return { success: true, fieldsExtracted: 0, totalFields: fieldDefs.length, source: 'llm' };
    }

    // Prepare document text
    const fullText = result.text || '';
    const preparedText = prepareDocumentText(fullText, settings.maxDocChars);

    // Token estimation
    const prompt = buildPrompt(missingFields, preparedText);
    const totalTokens = estimateTokens(prompt.system + prompt.user);

    let finalPrompt = prompt;
    if (totalTokens > 120_000) {
      // Too long, truncate missing fields to most important ones
      const prioritized = missingFields.slice(0, Math.ceil(missingFields.length * 0.4));
      if (prioritized.length === 0) {
        return { success: true, fieldsExtracted: 0, totalFields: fieldDefs.length, source: 'llm' };
      }
      const prompt2 = buildPrompt(prioritized, preparedText);
      const tokens2 = estimateTokens(prompt2.system + prompt2.user);
      if (tokens2 > 120_000) {
        console.warn(`[LLM] Job ${jobId}: context too large even after truncation (${tokens2} tokens), skipping`);
        return { success: false, fieldsExtracted: 0, totalFields: fieldDefs.length, source: 'fallback', error: 'Context too large' };
      }
      finalPrompt = prompt2;
    }

    // Get API key
    const keyRecord = db.prepare('SELECT * FROM api_configs LIMIT 1').get() as ApiKeyRecord;
    const apiKey = decrypt(keyRecord.api_key);

    // Call LLM
    const llmResponse = await callLLM(
      apiKey,
      keyRecord.base_url,
      keyRecord.model,
      finalPrompt.system,
      finalPrompt.user,
      settings.timeoutSeconds
    );

    // Parse response
    const llmResults = parseLlmResponse(llmResponse);

    // Merge
    const { merged, llmFields } = mergeResults(extracts, llmResults);

    console.log(`[LLM] Job ${jobId}: enhanced ${Object.keys(llmFields).length}/${missingFields.length} fields`);

    return {
      success: true,
      fieldsExtracted: Object.keys(llmFields).length,
      totalFields: fieldDefs.length,
      source: 'llm',
      merged,
      llmFields,
    };
  } catch (err: any) {
    console.error(`[LLM] Job ${jobId}: error:`, err.message);
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return { success: false, fieldsExtracted: 0, totalFields: 0, source: 'fallback', error: 'LLM timeout' };
    }
    if (err.response?.status === 429) {
      return { success: false, fieldsExtracted: 0, totalFields: 0, source: 'fallback', error: 'Rate limited' };
    }
    return { success: false, fieldsExtracted: 0, totalFields: 0, source: 'fallback', error: err.message || 'LLM error' };
  }
}
