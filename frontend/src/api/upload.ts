import apiClient from './client';

export interface TableRow {
  cells: string[];
}

export interface DocTable {
  rows: TableRow[];
}

export interface MarkedItem {
  symbol: string;
  text: string;
  page: number;
}

export interface UploadResult {
  id: string;
  filename: string;
  size: number;
  result: {
    status: string;
    text?: string;
    extracts?: Record<string, unknown>;
    groups?: Record<string, string>;
    chapters?: Array<{ title: string; content: string[]; page: number }>;
    tables?: DocTable[];
    markedItems?: MarkedItem[];
    pageCount?: number;
    paraToPage?: number[];
    error?: string;
  };
}

export interface ParseStatus {
  id: string;
  status: string;
  progress: number;
  filename: string;
  fileSize?: number;
  error?: string;
  result?: {
    status: string;
    text?: string;
    extracts?: Record<string, unknown>;
    groups?: Record<string, string>;
    chapters?: Array<{ title: string; content: string[]; page: number }>;
    tables?: DocTable[];
    markedItems?: MarkedItem[];
    pageCount?: number;
    paraToPage?: number[];
    error?: string;
  };
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<UploadResult>('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
}

export async function getParseStatus(id: string): Promise<ParseStatus> {
  const response = await apiClient.get<ParseStatus>(`/upload/${id}/status`);
  return response.data;
}