export interface ExtractionRule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: 'regex' | 'keyword';
}

export interface Template {
  id: string;
  type: 'bidding' | 'proposal' | 'custom';
  category: string;
  name: string;
  description: string;
}

export interface ThemeConfig {
  type: 'parchment' | 'dark' | 'white';
}

export interface ApiConfig {
  id: string;
  provider: string;
  model: string;
  apiKey: string;
  region?: string;
}

export interface ExportSetting {
  format: 'docx' | 'markdown';
  includeTableOfContents: boolean;
  pageNumbers: boolean;
  headerFooter: boolean;
}
