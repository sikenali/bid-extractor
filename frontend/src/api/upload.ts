import apiClient from './client';

export interface UploadResult {
  id: string;
  filename: string;
  path: string;
  size: number;
  status: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<UploadResult>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}

export async function getFileStatus(id: string): Promise<{ id: string; status: string }> {
  const response = await apiClient.get(`/upload/${id}/status`);
  return response.data;
}
