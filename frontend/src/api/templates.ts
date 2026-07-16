import apiClient from './client';

export interface Template {
  id: string;
  type: string;
  category: string;
  name: string;
  description: string;
}

export async function getTemplates(type?: string): Promise<Template[]> {
  const params = type ? { type } : {};
  const response = await apiClient.get<Template[]>('/templates', { params });
  return response.data;
}

export async function addTemplate(data: { type: string; category: string; name: string; description: string }): Promise<Template> {
  const response = await apiClient.post<Template>('/templates', data);
  return response.data;
}

export async function updateTemplate(id: string, data: Partial<Template>): Promise<Template> {
  const response = await apiClient.put<Template>(`/templates/${id}`, data);
  return response.data;
}

export async function deleteTemplate(id: string): Promise<{ deleted: boolean }> {
  const response = await apiClient.delete(`/templates/${id}`);
  return response.data;
}