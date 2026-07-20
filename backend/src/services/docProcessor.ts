import { spawn } from 'child_process';
import fs from 'fs';
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
  paraToPage?: number[];
  error?: string;
}

export interface ParseProgress {
  status: 'uploading' | 'parsing' | 'extracting' | 'done' | 'error';
  progress: number;
  message?: string;
}

const MAX_RETRIES = 2;
const TIMEOUT_MS = 60_000;

function getBinaryPath(): string {
  return path.join(__dirname, '..', '..', 'doc-handler', 'dist', 'doc-handler');
}

function checkBinary(binaryPath: string): boolean {
  return fs.existsSync(binaryPath) && fs.statSync(binaryPath).isFile();
}

export function parseDocument(filePath: string): Promise<ParseResult> {
  return new Promise((resolve) => {
    const binaryPath = getBinaryPath();

    if (!checkBinary(binaryPath)) {
      resolve({
        status: 'error',
        error: `doc-handler binary not found at: ${binaryPath}. Ensure the doc-handler project is built.`
      });
      return;
    }

    function attempt(retryCount: number): void {
      const proc = spawn(binaryPath, { stdio: ['pipe', 'pipe', 'pipe'] });
      let settled = false;

      const settle = (result: ParseResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        proc.kill('SIGTERM');
        resolve(result);
      };

      const timeout = setTimeout(() => {
        settle({ status: 'error', error: 'doc-handler timed out after 60 seconds' });
      }, TIMEOUT_MS);

      let output = '';
      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[doc-handler] ${msg}`);
      });

      proc.on('error', (err) => {
        settle({ status: 'error', error: `Failed to start doc-handler: ${err.message}` });
      });

      proc.on('close', (code) => {
        if (settled) return;

        // If process crashed with no output, retry
        if (code !== 0 && !output.trim()) {
          if (retryCount < MAX_RETRIES) {
            const delay = Math.pow(2, retryCount) * 1000;
            console.warn(`doc-handler exited with code ${code}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
            setTimeout(() => {
              proc.removeAllListeners();
              attempt(retryCount + 1);
            }, delay);
            return;
          }
          settle({ status: 'error', error: `Process exited with code ${code} after ${MAX_RETRIES} retries` });
          return;
        }

        // If we got partial output but exit was non-zero, still try to parse
        if (code !== 0 && retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`doc-handler exited with code ${code}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
          setTimeout(() => {
            proc.removeAllListeners();
            attempt(retryCount + 1);
          }, delay);
          return;
        }

        if (!output.trim()) {
          settle({ status: 'error', error: `Process exited with code ${code} and no output` });
          return;
        }

        try {
          const result = JSON.parse(output.trim()) as ParseResult;
          settle(result);
        } catch {
          settle({ status: 'error', error: `Failed to parse response from doc-handler. Raw output: ${output.substring(0, 500)}` });
        }
      });

      // Build rules from database
      const rules = db.prepare('SELECT field_name, pattern, category, group_name FROM extraction_rules WHERE enabled = 1').all();
      const rulesList = rules.map((r: any) => ({
        name: r.field_name,
        pattern: r.pattern,
        category: r.category,
        group: r.group_name
      }));

      const request = JSON.stringify({
        file_path: filePath,
        rules: rulesList
      });

      // Pipe request to stdin in chunks for flow control
      const chunkSize = 8192;
      let offset = 0;
      const writeNextChunk = () => {
        if (offset >= request.length || settled) {
          if (!settled) {
            proc.stdin.end();
          }
          return;
        }
        const end = Math.min(offset + chunkSize, request.length);
        const chunk = request.slice(offset, end);
        const continued = proc.stdin.write(chunk);
        offset = end;
        if (continued) {
          // More data can be written immediately
          writeNextChunk();
        } else {
          // Backpressure — wait for drain
          proc.stdin.once('drain', writeNextChunk);
        }
      };

      proc.stdin.on('error', (err) => {
        if (!settled) {
          settle({ status: 'error', error: `Failed to write to doc-handler stdin: ${err.message}` });
        }
      });

      writeNextChunk();
    }

    attempt(0);
  });
}
