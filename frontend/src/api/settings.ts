import apiClient from './client';

export interface LlmSettings {
  enabled: boolean;
  provider: string;
  maxDocChars: number;
  timeoutSeconds: number;
}

export interface LlmStatus {
  available: boolean;
  enabled: boolean;
  hasApiKey: boolean;
}

export async function getTheme(): Promise<{ type: string }> {
  const response = await apiClient.get('/settings/theme');
  return response.data;
}

export async function setTheme(type: string): Promise<{ type: string }> {
  const response = await apiClient.put('/settings/theme', { type });
  return response.data;
}

export async function getExportSettings(): Promise<{ format: string; include_table_of_contents: number; page_numbers: number }> {
  const response = await apiClient.get('/settings/export');
  return response.data;
}

export async function setExportSettings(data: { format: string; include_table_of_contents?: number; page_numbers?: number; header_footer?: number }): Promise<void> {
  await apiClient.put('/settings/export', data);
}

export async function getApiKeys(): Promise<Array<{ id: string; provider: string; model: string; region?: string; base_url?: string }>> {
  const response = await apiClient.get('/settings/apikeys');
  return response.data;
}

export async function addApiKey(data: { provider: string; model: string; api_key: string; region?: string; base_url?: string }): Promise<void> {
  await apiClient.post('/settings/apikeys', data);
}

export async function deleteApiKey(id: string): Promise<{ deleted: boolean }> {
  const response = await apiClient.delete(`/settings/apikeys/${id}`);
  return response.data;
}

export async function getLlmSettings(): Promise<{ enabled: boolean; provider: string; maxDocChars: number; timeoutSeconds: number }> {
  const response = await apiClient.get('/settings/llm_enhance');
  return response.data;
}

export async function setLlmSettings(data: { enabled?: boolean; provider?: string; maxDocChars?: number; timeoutSeconds?: number }): Promise<void> {
  await apiClient.put('/settings/llm_enhance', data);
}

export async function getLlmStatus(): Promise<{ available: boolean; enabled: boolean; hasApiKey: boolean }> {
  const response = await apiClient.get('/settings/llm_status');
  return response.data;
}
