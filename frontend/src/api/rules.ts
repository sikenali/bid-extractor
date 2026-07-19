import apiClient from './client';

export interface ExtractionRule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: string;
  groupName: string;
}

export async function getRules(group?: string): Promise<ExtractionRule[]> {
  const params = group ? { group } : {};
  const response = await apiClient.get<ExtractionRule[]>('/rules', { params });
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

export async function discoverRules(fieldNames: string[], groupName: string): Promise<{ inserted: string[]; count: number }> {
  const response = await apiClient.post('/rules/discover', { fieldNames, groupName });
  return response.data;
}

export interface SkillImportResult {
  name: string;
  inserted: { field: string; group: string; category: string }[];
  skipped: string[];
  count: number;
}

export async function importSkillMd(file: File): Promise<SkillImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<SkillImportResult>('/rules/import-skill', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}
