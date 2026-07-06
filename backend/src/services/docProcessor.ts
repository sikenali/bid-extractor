import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ParseResult {
  status: string;
  text?: string;
  extracts?: Record<string, unknown>;
  error?: string;
}

export function parseDocument(filePath: string, rules: unknown[]): Promise<ParseResult> {
  return new Promise((resolve) => {
    const binaryPath = path.join(__dirname, '..', '..', 'doc-handler', 'dist', 'doc-handler');
    const proc = spawn(binaryPath);

    let output = '';
    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      console.error('Doc handler error:', data.toString());
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ status: 'error', error: `Process exited with code ${code}` });
        return;
      }
      try {
        const result = JSON.parse(output.trim()) as ParseResult;
        resolve(result);
      } catch {
        resolve({ status: 'error', error: 'Failed to parse response' });
      }
    });

    const request = {
      file_path: filePath,
      rules
    };
    proc.stdin.write(JSON.stringify(request) + '\n');
    proc.stdin.end();
  });
}
