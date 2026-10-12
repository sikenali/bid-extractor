import apiClient from './client';

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

export async function addApiKey(data: { provider: string; model: string; api_key: string; region?: string; base_url?: string }): Promise<void> {
  await apiClient.post('/settings/apikeys', data);
}

// Template management API
export interface TemplateData {
  id?: number;
  name: string;
  type: 'bidding' | 'proposal' | 'custom';
  category: string;
  description: string;
  keywords: string[];
  createdAt?: number;
}

export async function getTemplateList(): Promise<{ templates: TemplateData[] }> {
  const response = await apiClient.get('/settings/templates');
  return response.data;
}

export async function createTemplate(data: Omit<TemplateData, 'id' | 'createdAt'>): Promise<void> {
  await apiClient.post('/settings/templates', data);
}

export async function updateTemplate(id: number, data: Omit<TemplateData, 'id' | 'createdAt'>): Promise<void> {
  await apiClient.put(`/settings/templates/${id}`, data);
}

export async function deleteTemplate(id: number): Promise<void> {
  await apiClient.delete(`/settings/templates/${id}`);
}

export async function toggleApiKey(id: string): Promise<{ enabled: number }> {
  const res = await apiClient.put(`/settings/apikeys/${id}/toggle`);
  return res.data;
}

export async function deleteApiKey(id: string): Promise<void> {
  await apiClient.delete(`/settings/apikeys/${id}`);
}

export async function testApiKey(data: { provider: string; model: string; key: string; endpoint?: string; format?: string }): Promise<{ available: boolean; error?: string }> {
  const res = await apiClient.post('/settings/test-key', data);
  return res.data;
}

