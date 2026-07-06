import apiClient from './client';

export interface ExtractionRule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: string;
}

export async function getRules(): Promise<ExtractionRule[]> {
  const response = await apiClient.get<ExtractionRule[]>('/rules');
  return response.data;
}

export async function addRule(data: Omit<ExtractionRule, 'id'>): Promise<ExtractionRule> {
  const response = await apiClient.post<ExtractionRule>('/rules', data);
  return response.data;
}

export async function updateRule(id: string, data: Partial<ExtractionRule>): Promise<ExtractionRule> {
  const response = await apiClient.put<ExtractionRule>(`/rules/${id}`, data);
  return response.data;
}

export async function deleteRule(id: string): Promise<{ deleted: boolean }> {
  const response = await apiClient.delete(`/rules/${id}`);
  return response.data;
}
