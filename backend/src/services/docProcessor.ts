import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TableRow {
  cells: string[];
}

export interface DocTable {
  rows: TableRow[];
}

export interface ParseResult {
  status: string;
  text?: string;
  extracts?: Record<string, unknown>;
  groups?: Record<string, string>;
  chapters?: Array<{ title: string; content: string[]; page: number }>;
  tables?: DocTable[];
  pageCount?: number;
  error?: string;
}

export interface ParseProgress {
  status: 'uploading' | 'parsing' | 'extracting' | 'done' | 'error';
  progress: number;
  message?: string;
}

export function parseDocument(filePath: string): Promise<ParseResult> {
  return new Promise((resolve) => {
    const binaryPath = path.join(__dirname, '..', '..', 'doc-handler', 'dist', 'doc-handler');
    const proc = spawn(binaryPath);

    let output = '';
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      console.error('Doc handler stderr:', data.toString());
    });

    proc.on('close', (code) => {
      if (code !== 0 && !output.trim()) {
        resolve({ status: 'error', error: `Process exited with code ${code}` });
        return;
      }
      try {
        const result = JSON.parse(output.trim()) as ParseResult;
        resolve(result);
      } catch {
        resolve({ status: 'error', error: 'Failed to parse response from doc-handler' });
      }
    });

    // Get rules from database
    const rules = db.prepare('SELECT field_name, pattern, category, group_name FROM extraction_rules WHERE enabled = 1').all();
    const rulesList = rules.map((r: any) => ({
      name: r.field_name,
      pattern: r.pattern,
      category: r.category,
      group: r.group_name
    }));

    const request = {
      file_path: filePath,
      rules: rulesList
    };
    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
  });
}
