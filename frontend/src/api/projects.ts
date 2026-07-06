import apiClient from './client';

export interface Project {
  id: string;
  name: string;
  biddingNumber: string;
  tenderOrg: string;
  budget?: number;
  deadline?: string;
  location?: string;
  scope?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function getProjects(): Promise<Project[]> {
  const response = await apiClient.get<Project[]>('/projects');
  return response.data;
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  const response = await apiClient.post<Project>('/projects', data);
  return response.data;
}

export async function getProject(id: string): Promise<Project> {
  const response = await apiClient.get<Project>(`/projects/${id}`);
  return response.data;
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  const response = await apiClient.put<Project>(`/projects/${id}`, data);
  return response.data;
}
