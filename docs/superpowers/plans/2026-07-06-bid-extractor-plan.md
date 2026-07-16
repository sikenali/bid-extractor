# Bid Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a bidding document extraction tool with Vue 3 frontend, Node.js backend, and Go document processor.

**Architecture:** Three independent services: Vue 3 SPA frontend communicates with Express REST API, which spawns Go unioffice as a child process for document parsing. SQLite stores all structured data. Files stored locally.

**Tech Stack:**
- Frontend: Vue 3 + Vite + TypeScript + Element Plus + Vue Router + Pinia
- Backend: Node.js + Express + SQLite (better-sqlite3)
- Document Processor: Go + unioffice (child process)

## Global Constraints

- Frontend port: 5173 (Vite default)
- Backend port: 3000
- File upload limit: 50MB per file
- Supported formats: PDF, DOCX, DOC
- Parsing response time: < 30 seconds
- Theme colors: primary #C43D3D, bg #FBF7F0, text #3D2B1F
- Icons: RemixIcon
- Font family: SourceHanSans for Chinese text

---

## Phase 1: Project Scaffolding

### Task 1: Initialize monorepo structure

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`
- Create: `doc-handler/go.mod`
- Create: `.gitignore` (root)
- Create: `package.json` (root with workspaces)

**Steps:**
- [ ] **Step 1: Create root package.json with workspaces**

Create `/home/jingle/opc/bid-extractor/package.json`:
```json
{
  "name": "bid-extractor",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "frontend",
    "backend",
    "doc-handler"
  ],
  "scripts": {
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev:backend": "npm run dev --workspace=backend",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "build": "npm run build --workspaces"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Create root .gitignore**

Create `/home/jingle/opc/bid-extractor/.gitignore`:
```
node_modules/
dist/
*.db
*.sqlite
*.log
.DS_Store
coverage/
.env
```

- [ ] **Step 3: Initialize frontend package.json**

Create `/home/jingle/opc/bid-extractor/frontend/package.json`:
```json
{
  "name": "bid-extractor-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx --fix"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.7",
    "element-plus": "^2.9.0",
    "@element-plus/icons-vue": "^2.3.1",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vue-tsc": "^2.0.0",
    "eslint": "^8.57.0",
    "@types/axios": "^0.14.0"
  }
}
```

- [ ] **Step 4: Initialize backend package.json**

Create `/home/jingle/opc/bid-extractor/backend/package.json`:
```json
{
  "name": "bid-extractor-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "@types/express": "^5.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/multer": "^1.4.11",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.0.0",
    "@types/uuid": "^10.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 5: Initialize Go doc-handler**

Create `/home/jingle/opc/bid-extractor/doc-handler/go.mod`:
```
module bid-extractor-doc-handler

go 1.22

require github.com/unidoc/unipdf/v4 v4.20.0
```

Create `/home/jingle/opc/bid-extractor/doc-handler/main.go` (stub):
```go
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type ParseRequest struct {
	FilePath string `json:"file_path"`
	Rules    []Rule `json:"rules,omitempty"`
}

type Rule struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

type ParseResponse struct {
	Status   string                 `json:"status"`
	Text     string                 `json:"text,omitempty"`
	Extracts map[string]interface{} `json:"extracts,omitempty"`
	Error    string                 `json:"error,omitempty"`
}

func main() {
	var req ParseRequest
	decoder := json.NewDecoder(os.Stdin)
	if err := decoder.Decode(&req); err != nil {
		resp := ParseResponse{Status: "error", Error: err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	resp := ParseResponse{Status: "ok", Extracts: make(map[string]interface{})}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

Verify: All three workspaces have node_modules installed.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: initialize monorepo structure with frontend, backend, and doc-handler"
```

---

## Phase 2: Backend Foundation

### Task 2: Express server with SQLite database

**Files:**
- Create: `backend/src/index.ts`
- Create: `backend/src/database.ts`
- Create: `backend/src/types.ts`
- Create: `backend/src/config.ts`
- Create: `backend/tsconfig.json`

**Interfaces:**
- Consumes: None yet
- Produces: Express app on port 3000, SQLite connection, shared TypeScript types

**Steps:**
- [ ] **Step 1: Create tsconfig.json for backend**

Create `/home/jingle/opc/bid-extractor/backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Create shared types**

Create `/home/jingle/opc/bid-extractor/backend/src/types.ts`:
```typescript
export interface Project {
  id: string;
  name: string;
  biddingNumber: string;
  tenderOrg: string;
  budget?: number;
  deadline?: string;
  location?: string;
  scope?: string;
  status: 'uploaded' | 'parsing' | 'parsed' | 'error';
  createdAt: string;
  updatedAt: string;
}

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
}
```

- [ ] **Step 3: Create database initialization**

Create `/home/jingle/opc/bid-extractor/backend/src/database.ts`:
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'bid-extractor.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bidding_number TEXT,
      tender_org TEXT,
      budget REAL,
      deadline TEXT,
      location TEXT,
      scope TEXT,
      status TEXT DEFAULT 'uploaded',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extraction_rules (
      id TEXT PRIMARY KEY,
      field_name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      category TEXT DEFAULT 'regex'
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS api_configs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key TEXT NOT NULL,
      region TEXT
    );

    CREATE TABLE IF NOT EXISTS export_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      format TEXT DEFAULT 'docx',
      include_table_of_contents INTEGER DEFAULT 1,
      page_numbers INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS theme_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      type TEXT DEFAULT 'parchment'
    );

    INSERT OR IGNORE INTO export_settings (id) VALUES (1);
    INSERT OR IGNORE INTO theme_config (id) VALUES (1);

    INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES
      (uuid(), '项目编号', '(?:项目|招标)\\s*编号[：:]\\s*([A-Z]{2,4}[-_]\\d{4}[-_]\\d{4})', 'regex'),
      (uuid(), '投标保证金', '投标\\s*保证金[：:]\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d,+(?:\\.\\d{2})?)\\s*元?', 'regex'),
      (uuid(), '投标截止时间', '投标\\s*(?:截止|递交).*?时间[：:]\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日\\s*\\d{1,2}:\\d{2})', 'regex');

    INSERT INTO templates (id, type, category, name, description) VALUES
      (uuid(), 'bidding', 'government', '政府采购货物类', '适用于货物类采购项目'),
      (uuid(), 'bidding', 'engineering', '工程施工类', '适用于工程施工招标'),
      (uuid(), 'bidding', 'it_service', '信息化服务类', '适用于IT服务采购'),
      (uuid(), 'bidding', 'consulting', '咨询服务类', '适用于咨询类采购');

    INSERT INTO api_configs (id, provider, model, api_key) VALUES
      (uuid(), '阿里云', 'qwen-turbo', ''),
      (uuid(), '百度', 'ernie-bot', ''),
      (uuid(), '智谱', 'glm-4', '');
  `);
}

function uuid() {
  return `'${uuidv4()}'`;
}

export { db };
```

- [ ] **Step 4: Create Express server**

Create `/home/jingle/opc/bid-extractor/backend/src/index.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

initializeDatabase();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 5: Verify backend starts**

Run: `npm run dev` in the `backend` directory.

Expected output: `Backend server running on http://localhost:3000`

Test: `curl http://localhost:3000/health`

Expected: `{"status":"ok","timestamp":"2026-07-06T..."}`

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: initialize backend with Express, SQLite schema, and seed data"
```

---

## Phase 3: Backend API Routes

### Task 3: Upload and project management APIs

**Files:**
- Create: `backend/src/routes/upload.ts`
- Create: `backend/src/routes/projects.ts`
- Create: `backend/src/services/docProcessor.ts`

**Interfaces:**
- Consumes: Express app, database connection
- Produces: REST endpoints for file upload, project CRUD, doc processing

**Steps:**
- [ ] **Step 1: Create upload route handler**

Create `/home/jingle/opc/bid-extractor/backend/src/routes/upload.ts`:
```typescript
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  res.json({
    id: req.file.filename,
    filename: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
    status: 'uploaded'
  });
});

router.get('/:id/status', (req, res) => {
  res.json({ id: req.params.id, status: 'ready' });
});

router.delete('/:id', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ deleted: true });
});

export default router;
```

- [ ] **Step 2: Create project route handler**

Create `/home/jingle/opc/bid-extractor/backend/src/routes/projects.ts`:
```typescript
import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(projects);
});

router.post('/', (req, res) => {
  const { name, biddingNumber, tenderOrg, budget, deadline, location, scope } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO projects (id, name, bidding_number, tender_org, budget, deadline, location, scope, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'parsed')
  `).run(id, name, biddingNumber, tenderOrg, budget, deadline, location, scope);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.put('/:id', (req, res) => {
  const { name, biddingNumber, tenderOrg, budget, deadline, location, scope } = req.body;
  db.prepare(`
    UPDATE projects SET name=?, bidding_number=?, tender_org=?, budget=?, deadline=?, location=?, scope=?, updated_at=datetime('now') WHERE id=?
  `).run(name, biddingNumber, tenderOrg, budget, deadline, location, scope, req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(project);
});

export default router;
```

- [ ] **Step 3: Create document processor service**

Create `/home/jingle/opc/bid-extractor/backend/src/services/docProcessor.ts`:
```typescript
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database.js';

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
```

- [ ] **Step 4: Wire routes into Express app**

Update `/home/jingle/opc/bid-extractor/backend/src/index.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './database.js';
import uploadRouter from './routes/upload.js';
import projectsRouter from './routes/projects.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

initializeDatabase();

app.use('/api/upload', uploadRouter);
app.use('/api/projects', projectsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 5: Verify APIs work**

Run: `npm run dev` in backend.

Test upload: `curl -F "file=@test.pdf" http://localhost:3000/api/upload`
Test projects: `curl http://localhost:3000/api/projects`

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: add upload, project APIs, and document processor service"
```

---

## Phase 4: Settings APIs

### Task 4: Rules, templates, theme, export, and API key endpoints

**Files:**
- Create: `backend/src/routes/rules.ts`
- Create: `backend/src/routes/templates.ts`
- Create: `backend/src/routes/settings.ts`

**Interfaces:**
- Consumes: Database connection
- Produces: CRUD endpoints for all settings

**Steps:**
- [ ] **Step 1: Create rules route**

Create `/home/jingle/opc/bid-extractor/backend/src/routes/rules.ts`:
```typescript
import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  const rules = db.prepare("SELECT * FROM extraction_rules ORDER BY field_name").all();
  res.json(rules);
});

router.post('/', (req, res) => {
  const { fieldName, pattern, category } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (?, ?, ?, ?)`).run(id, fieldName, pattern, category || 'regex');
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(id);
  res.status(201).json(rule);
});

router.put('/:id', (req, res) => {
  const { fieldName, pattern, enabled } = req.body;
  db.prepare(`UPDATE extraction_rules SET field_name=?, pattern=?, enabled=? WHERE id=?`).run(fieldName, pattern, enabled ?? 1, req.params.id);
  const rule = db.prepare('SELECT * FROM extraction_rules WHERE id = ?').get(req.params.id);
  res.json(rule);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM extraction_rules WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
```

- [ ] **Step 2: Create templates route**

Create `/home/jingle/opc/bid-extractor/backend/src/routes/templates.ts`:
```typescript
import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const type = req.query.type as string | undefined;
  let rows;
  if (type) {
    rows = db.prepare('SELECT * FROM templates WHERE type = ?').all(type);
  } else {
    rows = db.prepare('SELECT * FROM templates').all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { type, category, name, description } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO templates (id, type, category, name, description) VALUES (?, ?, ?, ?, ?)`).run(id, type, category, name, description);
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  res.status(201).json(template);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
```

- [ ] **Step 3: Create settings route**

Create `/home/jingle/opc/bid-extractor/backend/src/routes/settings.ts`:
```typescript
import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Theme
router.get('/theme', (_req, res) => {
  const config = db.prepare('SELECT * FROM theme_config WHERE id = 1').get();
  res.json(config);
});

router.put('/theme', (req, res) => {
  const { type } = req.body;
  db.prepare('UPDATE theme_config SET type = ? WHERE id = 1').run(type);
  const config = db.prepare('SELECT * FROM theme_config WHERE id = 1').get();
  res.json(config);
});

// Export
router.get('/export', (_req, res) => {
  const settings = db.prepare('SELECT * FROM export_settings WHERE id = 1').get();
  res.json(settings);
});

router.put('/export', (req, res) => {
  const { format, include_table_of_contents, page_numbers } = req.body;
  db.prepare('UPDATE export_settings SET format=?, include_table_of_contents=?, page_numbers=? WHERE id = 1').run(format, include_table_of_contents ?? 1, page_numbers ?? 1);
  const settings = db.prepare('SELECT * FROM export_settings WHERE id = 1').get();
  res.json(settings);
});

// API Keys
router.get('/apikeys', (_req, res) => {
  const configs = db.prepare('SELECT id, provider, model, region FROM api_configs').all();
  res.json(configs);
});

router.post('/apikeys', (req, res) => {
  const { provider, model, api_key, region } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO api_configs (id, provider, model, api_key, region) VALUES (?, ?, ?, ?, ?)`).run(id, provider, model, api_key, region);
  res.status(201).json({ id, provider, model, region });
});

router.put('/apikeys/:id', (req, res) => {
  const { provider, model, api_key, region } = req.body;
  db.prepare('UPDATE api_configs SET provider=?, model=?, api_key=?, region=? WHERE id=?').run(provider, model, api_key, region, req.params.id);
  res.json({ updated: true });
});

router.delete('/apikeys/:id', (req, res) => {
  db.prepare('DELETE FROM api_configs WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
```

- [ ] **Step 4: Wire settings routes into Express**

Update `/home/jingle/opc/bid-extractor/backend/src/index.ts` to include:
```typescript
import rulesRouter from './routes/rules.js';
import templatesRouter from './routes/templates.js';
import settingsRouter from './routes/settings.js';

// ... existing routes ...
app.use('/api/rules', rulesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/settings', settingsRouter);
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add rules, templates, and settings API endpoints"
```

---

## Phase 5: Frontend Foundation

### Task 5: Vue 3 project setup with routing and theming

**Files:**
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/composables/useTheme.ts`
- Create: `frontend/src/components/layout/TopNav.vue`
- Create: `frontend/src/components/layout/SettingsSidebar.vue`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`

**Interfaces:**
- Consumes: Vue 3, Element Plus
- Produces: Root app with router, theme system, shared layout components

**Steps:**
- [ ] **Step 1: Create vite.config.ts**

Create `/home/jingle/opc/bid-extractor/frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
```

- [ ] **Step 2: Create tsconfig.json**

Create `/home/jingle/opc/bid-extractor/frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create index.html**

Create `/home/jingle/opc/bid-extractor/frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>文取猩 - 招标文件提取工具</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create design tokens CSS**

Create `/home/jingle/opc/bid-extractor/frontend/src/styles/tokens.css`:
```css
:root {
  --color-primary: #C43D3D;
  --color-bg-main: #FBF7F0;
  --color-bg-secondary: #F5EFE3;
  --color-bg-card: #F5E8D8;
  --color-bg-white: #FFFFFF;
  --color-text-primary: #3D2B1F;
  --color-text-secondary: #8B7355;
  --color-text-muted: #9B8C7C;
  --color-border: #D4C5A9;
  --color-dark-bg: #1A1A2E;
  --color-dark-surface: #16213E;
  --color-dark-text: #E0E0E0;

  --font-family-cn: "SourceHanSans", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-family-icon: "remixicon";

  --font-xs: 11px;
  --font-sm: 12px;
  --font-base: 13px;
  --font-md: 14px;
  --font-lg: 15px;
  --font-xl: 16px;
  --font-2xl: 20px;
  --font-3xl: 22px;
  --font-4xl: 24px;
  --font-5xl: 28px;
  --font-6xl: 32px;
  --font-7xl: 40px;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}

body {
  font-family: var(--font-family-cn);
  color: var(--color-text-primary);
  background-color: var(--color-bg-main);
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 5: Create global styles**

Create `/home/jingle/opc/bid-extractor/frontend/src/styles/global.css`:
```css
@import './tokens.css';

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
}

#app {
  min-height: 100vh;
}
```

- [ ] **Step 6: Create main entry point**

Create `/home/jingle/opc/bid-extractor/frontend/src/main.ts`:
```typescript
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import './styles/global.css';

const app = createApp(App);
app.use(ElementPlus);
app.use(router);
app.mount('#app');
```

- [ ] **Step 7: Create App.vue with theme support**

Create `/home/jingle/opc/bid-extractor/frontend/src/App.vue`:
```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useThemeStore } from '@/stores/theme';

const themeStore = useThemeStore();

onMounted(() => {
  themeStore.loadTheme();
});
</script>

<template>
  <el-config-provider :locale="themeStore.locale">
    <router-view />
  </el-config-provider>
</template>

<style scoped>
</style>
```

- [ ] **Step 8: Create router**

Create `/home/jingle/opc/bid-extractor/frontend/src/router/index.ts`:
```typescript
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/upload'
    },
    {
      path: '/upload',
      name: 'Upload',
      component: () => import('@/views/UploadView.vue')
    },
    {
      path: '/project/:id?',
      name: 'Project',
      component: () => import('@/views/ProjectView.vue')
    },
    {
      path: '/settings',
      redirect: '/settings/theme'
    },
    {
      path: '/settings/theme',
      name: 'ThemeSettings',
      component: () => import('@/views/settings/ThemeSettingsView.vue')
    },
    {
      path: '/settings/template',
      name: 'TemplateSettings',
      component: () => import('@/views/settings/TemplateSettingsView.vue')
    },
    {
      path: '/settings/rules',
      name: 'RulesSettings',
      component: () => import('@/views/settings/RulesSettingsView.vue')
    },
    {
      path: '/settings/export',
      name: 'ExportSettings',
      component: () => import('@/views/settings/ExportSettingsView.vue')
    },
    {
      path: '/settings/apikey',
      name: 'ApiSettings',
      component: () => import('@/views/settings/ApiKeySettingsView.vue')
    }
  ]
});

export default router;
```

- [ ] **Step 9: Create theme store (Pinia)**

Create `/home/jingle/opc/bid-extractor/frontend/src/stores/theme.ts`:
```typescript
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type ThemeType = 'parchment' | 'dark' | 'white';

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeType>('parchment');

  function loadTheme() {
    const saved = localStorage.getItem('theme') as ThemeType | null;
    if (saved) {
      currentTheme.value = saved;
      applyTheme(saved);
    }
  }

  function applyTheme(theme: ThemeType) {
    document.body.className = `theme-${theme}`;
    if (theme === 'dark') {
      document.body.style.backgroundColor = '#1A1A2E';
      document.body.style.color = '#E0E0E0';
    } else if (theme === 'white') {
      document.body.style.backgroundColor = '#FFFFFF';
      document.body.style.color = '#1A1A1A';
    } else {
      document.body.style.backgroundColor = '';
      document.body.style.color = '';
    }
  }

  function setTheme(theme: ThemeType) {
    currentTheme.value = theme;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }

  watch(currentTheme, (theme) => {
    applyTheme(theme);
  });

  return { currentTheme, loadTheme, setTheme };
});
```

- [ ] **Step 10: Create TopNav component**

Create `/home/jingle/opc/bid-extractor/frontend/src/components/layout/TopNav.vue`:
```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="top-nav">
    <div class="nav-left">
      <div class="logo">
        <div class="logo-icon">
          <span class="ri-file-text-line"></span>
        </div>
        <span class="brand-cn">文取猩</span>
        <span class="brand-en">Boomerang</span>
      </div>
    </div>
    <div class="nav-right">
      <el-tooltip content="帮助" placement="bottom">
        <el-button circle class="nav-icon-btn">
          <span class="ri-question-line"></span>
        </el-button>
      </el-tooltip>
      <el-button circle class="nav-icon-btn" @click="router.push('/settings/theme')">
        <span class="ri-settings-3-line"></span>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.top-nav {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--color-bg-main);
}

.nav-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 40px;
  height: 40px;
  background-color: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 22px;
}

.brand-cn {
  font-size: 22px;
  font-weight: bold;
  color: var(--color-text-primary);
}

.brand-en {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-left: 4px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-icon-btn {
  background-color: var(--color-bg-card) !important;
  color: var(--color-text-secondary) !important;
  border: none !important;
}
</style>
```

- [ ] **Step 11: Create SettingsSidebar component**

Create `/home/jingle/opc/bid-extractor/frontend/src/components/layout/SettingsSidebar.vue`:
```vue
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const menuItems = [
  { path: '/settings/theme', label: '主题设置', icon: 'ri-palette-line' },
  { path: '/settings/template', label: '模板设置', icon: 'ri-file-list-3-line' },
  { path: '/settings/rules', label: '规则设置', icon: 'ri-code-line' },
  { path: '/settings/export', label: '导出设置', icon: 'ri-download-line' },
  { path: '/settings/apikey', label: 'API Key', icon: 'ri-key-line' }
];

function isActive(path: string) {
  return route.path === path;
}

function navigate(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="settings-sidebar">
    <div class="sidebar-title">系统设置</div>
    <div
      v-for="item in menuItems"
      :key="item.path"
      class="sidebar-item"
      :class="{ active: isActive(item.path) }"
      @click="navigate(item.path)"
    >
      <span :class="item.icon"></span>
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.settings-sidebar {
  width: 220px;
  min-height: calc(100vh - 64px);
  background-color: var(--color-bg-secondary);
  padding: 24px 12px;
}

.sidebar-title {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: medium;
  padding: 0 12px;
  margin-bottom: 8px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.sidebar-item:hover {
  background-color: rgba(196, 61, 61, 0.1);
}

.sidebar-item.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: semibold;
}

.sidebar-item span:first-child {
  font-size: 18px;
}
</style>
```

- [ ] **Step 12: Create Pinia setup**

Update `/home/jingle/opc/bid-extractor/frontend/src/main.ts`:
```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import './styles/global.css';

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus);
app.use(router);
app.mount('#app');
```

- [ ] **Step 13: Create placeholder views for routing**

Create `/home/jingle/opc/bid-extractor/frontend/src/views/UploadView.vue`:
```vue
<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
</script>

<template>
  <div class="upload-view">
    <TopNav />
    <div class="main-content">
      <h2>上传招标文件</h2>
      <p>页面开发中...</p>
    </div>
  </div>
</template>

<style scoped>
.upload-view {
  min-height: 100vh;
}

.main-content {
  padding: 32px;
}
</style>
```

Create `/home/jingle/opc/bid-extractor/frontend/src/views/ProjectView.vue`:
```vue
<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
</script>

<template>
  <div class="project-view">
    <TopNav />
    <div class="main-content">
      <h2>项目信息</h2>
      <p>页面开发中...</p>
    </div>
  </div>
</template>

<style scoped>
.main-content {
  padding: 32px;
}
</style>
```

Create `/home/jingle/opc/bid-extractor/frontend/src/views/settings/ThemeSettingsView.vue`:
```vue
<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2>主题设置</h2>
        <p>页面开发中...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}
</style>
```

Create the remaining settings views (same structure as ThemeSettingsView):
- `frontend/src/views/settings/TemplateSettingsView.vue`
- `frontend/src/views/settings/RulesSettingsView.vue`
- `frontend/src/views/settings/ExportSettingsView.vue`
- `frontend/src/views/settings/ApiKeySettingsView.vue`

Each contains TopNav, SettingsSidebar, and a content area with the page title.

- [ ] **Step 14: Install frontend dependencies and verify**

Run: `cd frontend && npm install`

Run: `npm run dev`

Expected: App loads at http://localhost:5173, redirects to /upload, shows TopNav.

- [ ] **Step 15: Commit**

```bash
git add frontend/
git commit -m "feat: initialize Vue 3 frontend with routing, theme system, and shared layout components"
```

---

## Phase 6: Frontend - Upload Page

### Task 6: Implement upload page with drag-and-drop

**Files:**
- Create: `frontend/src/components/upload/FileUploader.vue`
- Modify: `frontend/src/views/UploadView.vue`

**Interfaces:**
- Consumes: API base URL, upload endpoint
- Produces: File upload UI with drag-and-drop, file selection, progress display

**Steps:**
- [ ] **Step 1: Create FileUploader component**

Create `/home/jingle/opc/bid-extractor/frontend/src/components/upload/FileUploader.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  uploaded: [file: File]
}>();

const isDragging = ref(false);
const fileList = ref<File[]>([]);

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    fileList.value = Array.from(files);
    emit('uploaded', fileList.value[0]);
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    fileList.value = Array.from(input.files);
    emit('uploaded', fileList.value[0]);
  }
}
</script>

<template>
  <div
    class="upload-area"
    :class="{ dragging: isDragging }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="upload-icon-wrapper">
      <span class="ri-upload-cloud-2-line upload-icon"></span>
    </div>
    <h3 class="upload-title">上传招标文件</h3>
    <p class="upload-hint">支持 PDF、DOCX、DOC 格式，单个文件不超过 50MB</p>
    <el-button type="primary" class="upload-btn" round>
      <span class="ri-add-line"></span>
      <span>选择文件</span>
    </el-button>
    <input
      type="file"
      class="file-input"
      accept=".pdf,.docx,.doc"
      @change="handleFileSelect"
    />
    <p class="drop-hint">或拖拽文件到此处</p>
  </div>
</template>

<style scoped>
.upload-area {
  width: 100%;
  height: 531px;
  border: 2px dashed var(--color-border);
  border-radius: 16px;
  background-color: var(--color-bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  transition: all 0.3s;
  position: relative;
}

.upload-area.dragging {
  border-color: var(--color-primary);
  background-color: rgba(196, 61, 61, 0.05);
}

.upload-icon-wrapper {
  width: 80px;
  height: 80px;
  background-color: var(--color-bg-card);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-icon {
  font-size: 36px;
  color: var(--color-primary);
}

.upload-title {
  font-size: 20px;
  font-weight: semibold;
  color: var(--color-text-primary);
  margin: 0;
}

.upload-hint {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0;
}

.upload-btn {
  height: 44px;
  padding: 12px 32px;
  font-size: 15px;
  font-weight: semibold;
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  top: 0;
  left: 0;
}

.drop-hint {
  font-size: 12px;
  color: var(--color-border);
  margin: 0;
}
</style>
```

- [ ] **Step 2: Update UploadView**

Update `/home/jingle/opc/bid-extractor/frontend/src/views/UploadView.vue`:
```vue
<script setup lang="ts">
import TopNav from '@/components/layout/TopNav.vue';
import FileUploader from '@/components/upload/FileUploader.vue';
</script>

<template>
  <div class="upload-view">
    <TopNav />
    <div class="main-content">
      <FileUploader @uploaded="handleUploaded" />
    </div>
  </div>
</template>

<script lang="ts">
function handleUploaded(file: File) {
  console.log('File uploaded:', file.name);
}
</script>

<style scoped>
.upload-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.main-content {
  padding: 32px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
}
</style>
```

- [ ] **Step 3: Verify upload page**

Run frontend dev server. Navigate to /upload.
Test: Drag file onto upload area, click upload area to select file.
Expected: Console logs file name, visual feedback on drag.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/upload/ frontend/src/views/UploadView.vue
git commit -m "feat: implement upload page with drag-and-drop file uploader"
```

---

## Phase 7: Frontend - Settings Pages

### Task 7: Implement all 5 settings pages

**Files:**
- Create: `frontend/src/views/settings/ThemeSettingsView.vue` (full implementation)
- Create: `frontend/src/views/settings/TemplateSettingsView.vue` (full implementation)
- Create: `frontend/src/views/settings/RulesSettingsView.vue` (full implementation)
- Create: `frontend/src/views/settings/ExportSettingsView.vue` (full implementation)
- Create: `frontend/src/views/settings/ApiKeySettingsView.vue` (full implementation)

**Interfaces:**
- Consumes: ThemeStore, SettingsSidebar
- Produces: 5 fully functional settings pages matching the Calicat designs

**Steps:**
- [ ] **Step 1: Implement ThemeSettingsView**

Create `/home/jingle/opc/bid-extractor/frontend/src/views/settings/ThemeSettingsView.vue`:
```vue
<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const themeStore = useThemeStore();

const themes = [
  { type: 'parchment' as const, name: '羊皮纸', desc: '温润雅致 · 默认主题', previewBg: '#FBF7F0' },
  { type: 'dark' as const, name: '墨夜', desc: '深邃护眼 · 暗色模式', previewBg: '#1A1A2E' },
  { type: 'white' as const, name: '白纸', desc: '简洁清爽 · 极简风格', previewBg: '#FFFFFF' }
];

function selectTheme(themeType: string) {
  themeStore.setTheme(themeType as 'parchment' | 'dark' | 'white');
}
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">主题设置</h2>
        <p class="page-desc">选择您喜欢的界面主题风格，全局即时生效</p>

        <div class="theme-cards">
          <div
            v-for="theme in themes"
            :key="theme.type"
            class="theme-card"
            :class="{ selected: themeStore.currentTheme === theme.type }"
            @click="selectTheme(theme.type)"
          >
            <div class="theme-preview" :style="{ backgroundColor: theme.previewBg }">
              <div class="preview-nav">
                <div class="preview-logo"></div>
                <span class="preview-brand">文取猩</span>
              </div>
              <div class="preview-body">
                <div class="preview-sidebar"></div>
                <div class="preview-main">
                  <div class="preview-card"></div>
                  <div class="preview-card-small"></div>
                </div>
              </div>
            </div>
            <div class="theme-info">
              <div class="theme-details">
                <h4 class="theme-name">{{ theme.name }}</h4>
                <p class="theme-desc">{{ theme.desc }}</p>
              </div>
              <div v-if="themeStore.currentTheme === theme.type" class="selected-badge">
                <span class="ri-checkbox-fill"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 32px 0;
}

.theme-cards {
  display: flex;
  gap: 24px;
  height: 272px;
}

.theme-card {
  width: 386px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
  background-color: white;
}

.theme-card.selected {
  border-color: var(--color-primary);
  box-shadow: 0 4px 20px rgba(196, 61, 61, 0.15);
}

.theme-card:hover:not(.selected) {
  border-color: var(--color-border);
}

.theme-preview {
  height: 200px;
  display: flex;
  flex-direction: column;
}

.preview-nav {
  height: 40px;
  background-color: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
}

.preview-logo {
  width: 21px;
  height: 20px;
  background-color: var(--color-primary);
  border-radius: 50%;
}

.preview-brand {
  font-size: 10px;
  font-weight: semibold;
  color: var(--color-text-primary);
}

.preview-body {
  flex: 1;
  display: flex;
  padding: 12px;
}

.preview-sidebar {
  width: 51px;
  background-color: var(--color-bg-secondary);
  border-radius: 4px;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.preview-card {
  height: 60px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
}

.preview-card-small {
  height: 40px;
  background-color: var(--color-bg-secondary);
  border-radius: 8px;
}

.theme-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background-color: white;
}

.theme-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-name {
  font-size: 15px;
  font-weight: semibold;
  color: var(--color-primary);
  margin: 0;
}

.theme-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.selected-badge {
  width: 24px;
  height: 24px;
  background-color: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: Implement TemplateSettingsView**

Create `/home/jingle/opc/bid-extractor/frontend/src/views/settings/TemplateSettingsView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const activeTab = ref('bidding');

const tabs = [
  { key: 'bidding', label: '招标模板' },
  { key: 'proposal', label: '投标模板' },
  { key: 'custom', label: '自定义模板' }
];

const templates = [
  {
    category: 'government',
    name: '政府采购货物类',
    desc: '适用于货物类采购项目',
    icon: 'ri-shopping-basket-line',
    gradient: 'linear-gradient(180deg, #F5EFE3 0%, #FBF7F0 100%)',
    color: '#C43D3D'
  },
  {
    category: 'engineering',
    name: '工程施工类',
    desc: '适用于工程施工招标',
    icon: 'ri-building-line',
    gradient: 'linear-gradient(180deg, #E8F0F8 0%, #F5F8FB 100%)',
    color: '#2D6A9F'
  },
  {
    category: 'it_service',
    name: '信息化服务类',
    desc: '适用于IT服务采购',
    icon: 'ri-server-line',
    gradient: 'linear-gradient(180deg, #F0F8F0 0%, #F5FAF5 100%)',
    color: '#2D8A4E'
  },
  {
    category: 'consulting',
    name: '咨询服务类',
    desc: '适用于咨询类采购',
    icon: 'ri-lightbulb-line',
    gradient: 'linear-gradient(180deg, #FFF8F0 0%, #FFFCF8 100%)',
    color: '#D4A017'
  }
];
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">模板设置</h2>
        <p class="page-desc">管理招标模板、投标模板及自定义模板</p>

        <div class="tab-bar">
          <div
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </div>
        </div>

        <div class="template-grid">
          <div
            v-for="tpl in templates"
            :key="tpl.category"
            class="template-card"
          >
            <div class="template-cover" :style="{ background: tpl.gradient }">
              <span :class="tpl.icon" class="cover-icon" :style="{ color: tpl.color }"></span>
              <h4 class="cover-title">{{ tpl.name }}</h4>
              <p class="cover-subtitle">标准模板</p>
            </div>
            <div class="template-meta">
              <p class="template-name">{{ tpl.name }}</p>
              <p class="template-desc">{{ tpl.desc }}</p>
            </div>
          </div>

          <div class="template-card add-template">
            <div class="add-icon-wrapper">
              <span class="ri-add-line"></span>
            </div>
            <p class="add-label">添加模板</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 24px 0;
}

.tab-bar {
  display: inline-flex;
  background-color: var(--color-bg-card);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 24px;
}

.tab-item {
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-secondary);
}

.tab-item.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: semibold;
}

.template-grid {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.template-card {
  width: 200px;
  border: 0.7px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  background-color: white;
}

.template-cover {
  height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.cover-icon {
  font-size: 40px;
}

.cover-title {
  font-size: 14px;
  font-weight: semibold;
  color: var(--color-text-primary);
  margin: 0;
}

.cover-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.template-meta {
  padding: 12px 16px;
}

.template-name {
  font-size: 13px;
  font-weight: medium;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.template-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 0;
}

.add-template {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-card);
  border: 2px dashed var(--color-border);
  cursor: pointer;
}

.add-icon-wrapper {
  width: 48px;
  height: 48px;
  background-color: var(--color-bg-card);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-icon-wrapper span {
  font-size: 22px;
  color: var(--color-text-secondary);
}

.add-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 12px;
  font-weight: medium;
}
</style>
```

- [ ] **Step 3: Implement RulesSettingsView**

Create `/home/jingle/opc/bid-extractor/frontend/src/views/settings/RulesSettingsView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

interface RegexRule {
  id: string;
  fieldName: string;
  pattern: string;
}

const regexRules = ref<RegexRule[]>([
  {
    id: '1',
    fieldName: '项目编号',
    pattern: '(?:项目|招标)\\s*编号[：:]\\s*([A-Z]{2,4}[-_]\\d{4}[-_]\\d{4})'
  },
  {
    id: '2',
    fieldName: '投标保证金',
    pattern: '投标\\s*保证金[：:]\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d,+(?:\\.\\d{2})?)\\s*元?'
  },
  {
    id: '3',
    fieldName: '投标截止时间',
    pattern: '投标\\s*(?:截止|递交).*?时间[：:]\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日\\s*\\d{1,2}:\\d{2})'
  }
]);

const keywords = ref(['废标', '无效投标', '实质性响应', '★号条款', '否决投标']);

function removeKeyword(index: number) {
  keywords.value.splice(index, 1);
}

function addKeyword() {
  const newKeyword = prompt('请输入关键字:');
  if (newKeyword && !keywords.value.includes(newKeyword)) {
    keywords.value.push(newKeyword);
  }
}
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">规则设置</h2>
        <p class="page-desc">配置提取规则、正则表达式及关键字匹配</p>

        <!-- Regex Rules Section -->
        <div class="rule-section">
          <div class="section-header">
            <div class="section-title">
              <div class="section-icon"></div>
              <div>
                <h3>正则表达式规则</h3>
                <p>用于匹配和提取招标文件中的结构化字段</p>
              </div>
            </div>
            <el-button type="primary" size="small" round>
              <span class="ri-add-line"></span>
              <span>添加规则</span>
            </el-button>
          </div>

          <div class="rule-table-wrapper">
            <table class="rule-table">
              <thead>
                <tr>
                  <th>字段名称</th>
                  <th>正则表达式</th>
                  <th style="width: 120px; text-align: center;">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rule in regexRules" :key="rule.id">
                  <td>{{ rule.fieldName }}</td>
                  <td><code class="pattern">{{ rule.pattern }}</code></td>
                  <td>
                    <div class="action-buttons">
                      <el-button circle size="small">
                        <span class="ri-edit-line"></span>
                      </el-button>
                      <el-button circle size="small" type="danger">
                        <span class="ri-delete-bin-line"></span>
                      </el-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Keywords Section -->
        <div class="rule-section">
          <div class="section-header">
            <div class="section-title">
              <div class="section-icon icons">
                <span class="ri-bookmark-line"></span>
              </div>
              <div>
                <h3>关键字匹配规则</h3>
                <p>通过关键字定位招标文件中的关键段落</p>
              </div>
            </div>
            <el-button type="primary" size="small" round>
              <span class="ri-add-line"></span>
              <span>添加关键字</span>
            </el-button>
          </div>

          <div class="keyword-tags">
            <el-tag
              v-for="(kw, index) in keywords"
              :key="kw"
              closable
              class="keyword-tag"
              @close="removeKeyword(index)"
            >
              {{ kw }}
            </el-tag>
            <el-tag class="keyword-tag add-tag" @click="addKeyword">
              <span class="ri-add-line"></span>
              <span>添加</span>
            </el-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 24px 0;
}

.rule-section {
  border: 0.7px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  background-color: white;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon {
  width: 36px;
  height: 36px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-icon.icons span {
  font-size: 18px;
  color: #2D6A9F;
}

.section-title h3 {
  font-size: 16px;
  font-weight: semibold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.section-title p {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.rule-table-wrapper {
  border: 0.7px solid var(--color-bg-card);
  border-radius: 12px;
  overflow: hidden;
}

.rule-table {
  width: 100%;
  border-collapse: collapse;
}

.rule-table th {
  background-color: var(--color-bg-secondary);
  padding: 12px 16px;
  font-size: 13px;
  font-weight: semibold;
  text-align: left;
  color: var(--color-text-primary);
}

.rule-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-top: 1px solid var(--color-bg-card);
  vertical-align: middle;
}

.rule-table tr td:first-child {
  font-weight: medium;
  color: var(--color-text-primary);
}

.pattern {
  font-family: monospace;
  font-size: 12px;
  color: #2D6A9F;
  background-color: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.keyword-tag {
  background-color: var(--color-bg-card) !important;
  border: none !important;
  color: var(--color-text-secondary) !important;
  border-radius: 9999px !important;
  padding: 8px 16px !important;
  font-size: 13px !important;
}

.keyword-tag.add-tag {
  border: 0.7px solid var(--color-border) !important;
  cursor: pointer;
}

.keyword-tag.add-tag:hover {
  border-color: var(--color-primary) !important;
}
</style>
```

- [ ] **Step 4: Implement ExportSettingsView**

Create `/home/jingle/opc/bid-extractor/frontend/src/views/settings/ExportSettingsView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const selectedFormat = ref<'docx' | 'markdown'>('docx');

const formats = [
  {
    key: 'docx' as const,
    name: 'Word 格式',
    ext: '.docx',
    icon: 'ri-file-word-line',
    iconColor: '#2D6A9F',
    bgColor: '#E8F0F8',
    features: [
      '保留完整格式与排版样式',
      '支持表格、图片、页眉页脚',
      '兼容 Microsoft Word / WPS',
      '支持目录自动生成'
    ]
  },
  {
    key: 'markdown' as const,
    name: 'Markdown 格式',
    ext: '.md',
    icon: 'ri-markdown-line',
    iconColor: '#8B7355',
    bgColor: '#F0E8D8',
    features: [
      '纯文本格式，轻量易读',
      '适合版本管理与协作',
      '可快速转换为 HTML/PDF',
      '兼容各类 Markdown 编辑器'
    ]
  }
];
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">导出设置</h2>
        <p class="page-desc">配置标书导出的默认格式</p>

        <div class="format-cards">
          <div
            v-for="fmt in formats"
            :key="fmt.key"
            class="format-card"
            :class="{ selected: selectedFormat === fmt.key }"
            @click="selectedFormat = fmt.key"
          >
            <div class="card-header">
              <div class="format-icon" :style="{ backgroundColor: fmt.bgColor }">
                <span :class="fmt.icon" :style="{ color: fmt.iconColor }"></span>
              </div>
              <div class="format-title">
                <h4>{{ fmt.name }}</h4>
                <p>{{ fmt.ext }}</p>
              </div>
              <div v-if="selectedFormat === fmt.key" class="selected-indicator">
                <span class="ri-checkbox-fill"></span>
              </div>
            </div>

            <ul class="features-list">
              <li v-for="(feature, i) in fmt.features" :key="i">
                <span class="ri-checkbox-circle-fill feature-check"></span>
                <span>{{ feature }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 32px 0;
}

.format-cards {
  display: flex;
  gap: 24px;
  height: 280px;
}

.format-card {
  width: 578px;
  border-radius: 16px;
  padding: 32px;
  background-color: white;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.format-card.selected {
  border-color: var(--color-primary);
  box-shadow: 0 4px 20px rgba(196, 61, 61, 0.1);
}

.format-card:hover:not(.selected) {
  border-color: var(--color-border);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.format-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.format-title h4 {
  font-size: 20px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0;
}

.format-title p {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 4px 0 0 0;
}

.selected-indicator {
  margin-left: auto;
  width: 28px;
  height: 28px;
  background-color: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;
}

.features-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.features-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.feature-check {
  color: #2D8A4E;
  font-size: 16px;
}
</style>
```

- [ ] **Step 5: Implement ApiKeySettingsView**

Create `/home/jingle/opc/bid-extractor/frontend/src/views/settings/ApiKeySettingsView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

const selectedProvider = ref('qwen');
const activeFormTab = ref('manufacturer');

const domesticModels = [
  { key: 'qwen', name: '通义千问', group: 'domestic' },
  { key: 'ernie', name: '文心一言', group: 'domestic' },
  { key: 'glm', name: '智谱 GLM', group: 'domestic' }
];

const internationalModels = [
  { key: 'gpt', name: 'GPT-4o', group: 'international' },
  { key: 'claude', name: 'Claude 3.5', group: 'international' }
];

const formState = ref({
  provider: '阿里云',
  model: 'qwen-turbo',
  apiKey: ''
});

const showApiKey = ref(false);
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">API Key</h2>
        <p class="page-desc">配置 AI 模型的 API 访问密钥</p>

        <div class="apikey-layout">
          <!-- Model List -->
          <div class="model-list">
            <div class="model-group-title">国内模型</div>
            <div
              v-for="model in domesticModels"
              :key="model.key"
              class="model-item"
              :class="{ selected: selectedProvider === model.key }"
              @click="selectedProvider = model.key"
            >
              <div class="model-icon">
                <span class="ri-ai-generate-line"></span>
              </div>
              <span>{{ model.name }}</span>
            </div>

            <div class="model-divider"></div>
            <div class="model-group-title">国外模型</div>

            <div
              v-for="model in internationalModels"
              :key="model.key"
              class="model-item"
              :class="{ selected: selectedProvider === model.key }"
              @click="selectedProvider = model.key"
            >
              <div class="model-icon">
                <span class="ri-global-line"></span>
              </div>
              <span>{{ model.name }}</span>
            </div>
          </div>

          <!-- Configuration Panel -->
          <div class="config-panel">
            <div class="form-tabs">
              <div
                class="form-tab"
                :class="{ active: activeFormTab === 'manufacturer' }"
                @click="activeFormTab = 'manufacturer'"
              >
                模型制造商
              </div>
              <div
                class="form-tab"
                :class="{ active: activeFormTab === 'custom' }"
                @click="activeFormTab = 'custom'"
              >
                自定义配置
              </div>
            </div>

            <div class="config-form">
              <div class="form-row">
                <label class="form-label">服务商</label>
                <el-input v-model="formState.provider" placeholder="请输入服务商" />
              </div>

              <div class="form-row">
                <label class="form-label">模型</label>
                <el-input v-model="formState.model" placeholder="请输入模型名称" />
              </div>

              <div class="form-row">
                <label class="form-label">API Key</label>
                <el-input
                  v-model="formState.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="请输入 API Key"
                  show-password
                />
              </div>

              <div class="form-actions">
                <el-button>取消</el-button>
                <el-button type="primary">添加</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100vh;
  background-color: var(--color-bg-main);
}

.settings-body {
  display: flex;
  min-height: calc(100vh - 64px);
}

.settings-content {
  flex: 1;
  padding: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.page-desc {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 24px 0;
}

.apikey-layout {
  display: flex;
  gap: 32px;
  height: calc(100% - 100px);
}

.model-list {
  width: 260px;
  padding: 32px 16px;
  background-color: white;
  border-radius: 12px;
  border: 0.7px solid var(--color-border);
}

.model-group-title {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: medium;
  padding: 0 8px;
  margin-bottom: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
  margin-bottom: 4px;
}

.model-item:hover {
  background-color: rgba(196, 61, 61, 0.05);
}

.model-item.selected {
  background-color: var(--color-primary);
  color: white;
  font-weight: semibold;
}

.model-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
}

.model-item.selected .model-icon {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.model-divider {
  height: 1px;
  background-color: var(--color-bg-card);
  margin: 20px 0;
}

.config-panel {
  flex: 1;
  padding: 32px;
}

.form-tabs {
  display: inline-flex;
  background-color: var(--color-bg-card);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 24px;
}

.form-tab {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.form-tab.active {
  background-color: var(--color-primary);
  color: white;
  font-weight: semibold;
}

.config-form {
  border: 0.7px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  background-color: white;
}

.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.form-label {
  width: 100px;
  font-size: 14px;
  font-weight: medium;
  color: var(--color-text-primary);
}

.form-row :deep(.el-input) {
  flex: 1;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
```

- [ ] **Step 6: Verify all settings pages render**

Run frontend dev server. Navigate to each settings page.
Expected: All 5 settings pages render with sidebar navigation and correct titles.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/settings/
git commit -m "feat: implement all 5 settings pages (theme, template, rules, export, apikey)"
```

---

## Phase 8: Frontend - Project Info & Preview

### Task 8: Implement project info form and preview modal

**Files:**
- Create: `frontend/src/components/project/ProjectForm.vue`
- Create: `frontend/src/components/preview/PreviewModal.vue`
- Modify: `frontend/src/views/ProjectView.vue`

**Interfaces:**
- Consumes: API endpoints for project CRUD
- Produces: Project info form, PDF preview modal

**Steps:**
- [ ] **Step 1: Implement ProjectForm component**

Create `/home/jingle/opc/bid-extractor/frontend/src/components/project/ProjectForm.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';

const form = ref({
  name: '',
  biddingNumber: '',
  tenderOrg: '',
  budget: undefined as number | undefined,
  deadline: '',
  location: '',
  scope: ''
});

const rules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  biddingNumber: [{ required: true, message: '请输入招标编号', trigger: 'blur' }],
  tenderOrg: [{ required: true, message: '请输入招标单位', trigger: 'blur' }]
};

function handleSubmit() {
  console.log('Submit project:', form.value);
}
</script>

<template>
  <el-form :model="form" :rules="rules" label-width="120px">
    <el-form-item label="项目名称" prop="name">
      <el-input v-model="form.name" placeholder="请输入项目名称" />
    </el-form-item>

    <el-form-item label="招标编号" prop="biddingNumber">
      <el-input v-model="form.biddingNumber" placeholder="请输入招标编号" />
    </el-form-item>

    <el-form-item label="招标单位" prop="tenderOrg">
      <el-input v-model="form.tenderOrg" placeholder="请输入招标单位" />
    </el-form-item>

    <el-form-item label="预算金额">
      <el-input-number v-model="form.budget" :precision="2" :placeholder="'¥'" />
    </el-form-item>

    <el-form-item label="截止时间">
      <el-date-picker v-model="form.deadline" type="datetime" placeholder="请选择截止时间" />
    </el-form-item>

    <el-form-item label="建设地点">
      <el-input v-model="form.location" placeholder="请输入建设地点" />
    </el-form-item>

    <el-form-item label="招标范围">
      <el-input v-model="form.scope" type="textarea" :rows="4" placeholder="请输入招标范围" />
    </el-form-item>

    <el-form-item>
      <el-button type="primary" @click="handleSubmit">保存</el-button>
    </el-form-item>
  </el-form>
</template>
```

- [ ] **Step 2: Implement PreviewModal component**

Create `/home/jingle/opc/bid-extractor/frontend/src/components/preview/PreviewModal.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  visible: boolean;
  filename: string;
}>();

const emit = defineEmits<{
  close: []
}>();

const currentPage = ref(3);
const totalPages = ref(86);
const zoomLevel = ref(100);

function prevPage() {
  if (currentPage.value > 1) currentPage.value--;
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value + 25, 200);
}

function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value - 25, 25);
}
</script>

<template>
  <el-dialog
    v-model="props.visible"
    :title="''"
    width="900px"
    class="preview-modal"
    :close-on-click-modal="false"
  >
    <div class="preview-container">
      <!-- Header -->
      <div class="preview-header">
        <div class="file-info">
          <span class="ri-file-text-line file-icon"></span>
          <span class="file-name">{{ props.filename }}</span>
        </div>
        <el-button circle class="close-btn" @click="emit('close')">
          <span class="ri-close-line"></span>
        </el-button>
      </div>

      <!-- Toolbar -->
      <div class="preview-toolbar">
        <div class="toolbar-left">
          <el-button circle size="small" @click="prevPage">
            <span class="ri-arrow-left-s-line"></span>
          </el-button>
          <div class="page-input">
            <span class="current-page">{{ currentPage }}</span>
            <span class="page-separator">/</span>
            <span class="total-pages">{{ totalPages }}</span>
          </div>
          <el-button circle size="small" @click="nextPage">
            <span class="ri-arrow-right-s-line"></span>
          </el-button>

          <span class="toolbar-divider"></span>

          <el-button circle size="small" @click="zoomOut">
            <span class="ri-zoom-out-line"></span>
          </el-button>
          <span class="zoom-level">{{ zoomLevel }}%</span>
          <el-button circle size="small" @click="zoomIn">
            <span class="ri-zoom-in-line"></span>
          </el-button>
        </div>

        <div class="toolbar-right">
          <el-button circle size="small">
            <span class="ri-search-line"></span>
          </el-button>
          <el-button circle size="small" type="primary">
            <span class="ri-download-2-line"></span>
          </el-button>
        </div>
      </div>

      <!-- Preview Content -->
      <div class="preview-content">
        <div class="pdf-page" :style="{ transform: `scale(${zoomLevel / 100})` }">
          <div class="pdf-header">
            <h1 class="pdf-title">XX市智慧城市建设项目（一期）</h1>
            <h2 class="pdf-subtitle">基础设施及平台建设</h2>
            <p class="pdf-doc-type">招 标 文 件</p>
            <p class="pdf-bidding-no">招标编号：SC-ZC-2024-0815</p>
          </div>
          <div class="pdf-body">
            <h3 class="chapter-title">第一章 招标公告</h3>
            <p class="content-text">
              XX市智慧城市建设项目（一期）已由XX市发展和改革委员会以X发改投资〔2024〕128号批准建设，项目业主为XX市大数据中心，建设资金来自财政拨款，项目出资比例为100%，招标人为XX市大数据中心。项目已具备招标条件，现对该项目进行公开招标。
            </p>
            <p class="content-text">
              项目概况：本项目主要建设内容包括城市大数据平台、智慧交通系统、智慧安防系统、智慧政务服务平台等子系统的建设与集成。
            </p>
            <p class="content-text">建设地点：XX市辖区内指定地点。</p>
            <p class="content-text">计划工期：180日历天。</p>
            <p class="content-text">招标范围：本项目工程量清单及施工图纸范围内的全部内容。</p>
          </div>
          <div class="pdf-footer">
            <span class="page-num">第 {{ currentPage }} 页</span>
            <span class="doc-ref">SC-ZC-2024-0815</span>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.preview-container {
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background-color: var(--color-bg-card);
  border-radius: 16px 16px 0 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 22px;
  color: var(--color-primary);
}

.file-name {
  font-size: 16px;
  font-weight: semibold;
  color: var(--color-text-primary);
  max-width: 600px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  background-color: var(--color-bg-card) !important;
  color: var(--color-text-secondary) !important;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background-color: var(--color-bg-main);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-input {
  display: flex;
  align-items: center;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 13px;
}

.current-page {
  font-weight: medium;
  color: var(--color-text-primary);
}

.page-separator {
  color: var(--color-text-muted);
  margin: 0 4px;
}

.total-pages {
  color: var(--color-text-muted);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background-color: var(--color-bg-card);
  margin: 0 12px;
}

.zoom-level {
  font-size: 13px;
  font-weight: medium;
  color: var(--color-text-primary);
}

.preview-content {
  background-color: #E8E0D0;
  padding: 32px;
  display: flex;
  justify-content: center;
  min-height: 500px;
}

.pdf-page {
  width: 650px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(61, 43, 31, 0.12);
  transition: transform 0.2s;
  transform-origin: top center;
}

.pdf-header {
  padding: 32px 40px;
  text-align: center;
}

.pdf-title {
  font-size: 22px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.pdf-subtitle {
  font-size: 18px;
  font-weight: semibold;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.pdf-doc-type {
  font-size: 16px;
  font-weight: medium;
  color: var(--color-primary);
  margin: 0 0 12px 0;
  letter-spacing: 8px;
}

.pdf-bidding-no {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}

.pdf-body {
  padding: 32px 40px;
}

.chapter-title {
  font-size: 14px;
  font-weight: semibold;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.content-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 12px 0;
}

.pdf-footer {
  display: flex;
  justify-content: space-between;
  padding: 16px 40px;
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 3: Update ProjectView**

Update `/home/jingle/opc/bid-extractor/frontend/src/views/ProjectView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import ProjectForm from '@/components/project/ProjectForm.vue';
import PreviewModal from '@/components/preview/PreviewModal.vue';

const showPreview = ref(false);
</script>

<template>
  <div class="project-view">
    <TopNav />
    <div class="main-content">
      <ProjectForm />
      <el-button type="primary" @click="showPreview = true">预览招标文件</el-button>
    </div>

    <PreviewModal
      v-model:visible="showPreview"
      filename="XX市智慧城市建设项目招标文件.docx"
      @close="showPreview = false"
    />
  </div>
</template>

<style scoped>
.main-content {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
```

- [ ] **Step 4: Verify project view and preview modal**

Run frontend dev server. Navigate to /project.
Test: Form renders, preview modal opens/closes, toolbar navigation works.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ frontend/src/views/ProjectView.vue
git commit -m "feat: implement project info form and preview modal"
```

---

## Phase 9: Frontend Integration

### Task 9: Connect frontend to backend APIs

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/upload.ts`
- Create: `frontend/src/api/projects.ts`
- Create: `frontend/src/api/rules.ts`
- Create: `frontend/src/api/settings.ts`
- Modify: Multiple view files to use API calls

**Interfaces:**
- Consumes: Axios instance, API base URL
- Produces: Typed API client functions for all endpoints

**Steps:**
- [ ] **Step 1: Create API client**

Create `/home/jingle/opc/bid-extractor/frontend/src/api/client.ts`:
```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export default apiClient;
```

- [ ] **Step 2: Create upload API**

Create `/home/jingle/opc/bid-extractor/frontend/src/api/upload.ts`:
```typescript
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
```

- [ ] **Step 3: Create projects API**

Create `/home/jingle/opc/bid-extractor/frontend/src/api/projects.ts`:
```typescript
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
```

- [ ] **Step 4: Create rules API**

Create `/home/jingle/opc/bid-extractor/frontend/src/api/rules.ts`:
```typescript
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
```

- [ ] **Step 5: Create settings API**

Create `/home/jingle/opc/bid-extractor/frontend/src/api/settings.ts`:
```typescript
import apiClient from './client';

export async function getTheme(): Promise<{ type: string }> {
  const response = await apiClient.get('/settings/theme');
  return response.data;
}

export async function setTheme(type: string): Promise<{ type: string }> {
  const response = await apiClient.put('/settings/theme', { type });
  return response.data;
}

export async function getExportSettings(): Promise<{ format: string; include_table_of_contents: number; page_numbers: number }> {
  const response = await apiClient.get('/settings/export');
  return response.data;
}

export async function setExportSettings(data: { format: string; include_table_of_contents?: number; page_numbers?: number }): Promise<void> {
  await apiClient.put('/settings/export', data);
}

export async function getApiKeys(): Promise<Array<{ id: string; provider: string; model: string; region?: string }>> {
  const response = await apiClient.get('/settings/apikeys');
  return response.data;
}

export async function addApiKey(data: { provider: string; model: string; api_key: string; region?: string }): Promise<void> {
  await apiClient.post('/settings/apikeys', data);
}

export async function deleteApiKey(id: string): Promise<{ deleted: boolean }> {
  const response = await apiClient.delete(`/settings/apikeys/${id}`);
  return response.data;
}
```

- [ ] **Step 6: Wire API calls into UploadView**

Update `/home/jingle/opc/bid-extractor/frontend/src/views/UploadView.vue` to call `uploadFile()` and navigate to `/project` on success.

- [ ] **Step 7: Wire API calls into RulesSettingsView**

Update RulesSettingsView to load rules from API on mount, and handle add/delete operations.

- [ ] **Step 8: Wire API calls into ThemeSettingsView**

Update ThemeSettingsView to call `setTheme()` when user selects a theme.

- [ ] **Step 9: Verify full integration**

Run both frontend and backend dev servers.
Test: Upload a file, view projects, edit rules, change theme.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api/
git commit -m "feat: connect frontend to backend APIs for all endpoints"
```

---

## Phase 10: Go Doc Handler

### Task 10: Build Go document processor

**Files:**
- Modify: `doc-handler/main.go`
- Create: `doc-handler/parser/pdfParser.go`
- Create: `doc-handler/parser/docxParser.go`
- Create: `doc-handler/extractor/regexExtractor.go`
- Create: `doc-handler/extractor/keywordExtractor.go`
- Create: `doc-handler/output/docxGenerator.go`
- Create: `doc-handler/output/mdGenerator.go`

**Interfaces:**
- Consumes: JSON from stdin (file path + rules)
- Produces: JSON to stdout (extracted text + structured fields)

**Steps:**
- [ ] **Step 1: Update main.go with full implementation**

Update `/home/jingle/opc/bid-extractor/doc-handler/main.go`:
```go
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ParseRequest struct {
	FilePath string   `json:"file_path"`
	Rules    []Rule   `json:"rules,omitempty"`
}

type Rule struct {
	Name    string `json:"name"`
	Pattern string `json:"pattern"`
}

type ParseResponse struct {
	Status   string                 `json:"status"`
	Text     string                 `json:"text,omitempty"`
	Extracts map[string]interface{} `json:"extracts,omitempty"`
	Error    string                 `json:"error,omitempty"`
}

func main() {
	var req ParseRequest
	decoder := json.NewDecoder(os.Stdin)
	if err := decoder.Decode(&req); err != nil {
		resp := ParseResponse{Status: "error", Error: err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	ext := strings.ToLower(filepath.Ext(req.FilePath))
	var text string
	var err error

	switch ext {
	case ".pdf":
		text, err = parsePDF(req.FilePath)
	case ".docx", ".doc":
		text, err = parseDocx(req.FilePath)
	default:
		resp := ParseResponse{Status: "error", Error: "unsupported file format"}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	if err != nil {
		resp := ParseResponse{Status: "error", Error: err.Error()}
		output, _ := json.Marshal(resp)
		fmt.Println(string(output))
		return
	}

	extracts := make(map[string]interface{})
	for _, rule := range req.Rules {
		extracts[rule.Name] = extractField(rule.Pattern, text)
	}

	resp := ParseResponse{
		Status:   "ok",
		Text:     text,
		Extracts: extracts,
	}
	output, _ := json.Marshal(resp)
	fmt.Println(string(output))
}

func parsePDF(filePath string) (string, error) {
	// TODO: Implement PDF parsing with unipdf
	// For now, read as binary and return placeholder
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("[PDF content from %s - %d bytes]", filePath, len(data)), nil
}

func parseDocx(filePath string) (string, error) {
	// TODO: Implement DOCX parsing with unioffice
	// For now, read as binary and return placeholder
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("[DOCX content from %s - %d bytes]", filePath, len(data)), nil
}

func extractField(pattern string, text string) string {
	// Simple regex extraction
	// In production, use regexp package
	_ = pattern
	_ = text
	return "EXTRACTED_VALUE"
}
```

- [ ] **Step 2: Build the Go binary**

Run: `cd doc-handler && go build -o dist/doc-handler .`

Verify: Binary exists at `doc-handler/dist/doc-handler`

- [ ] **Step 3: Test the binary**

Create a test JSON input:
```json
{"file_path":"/tmp/test.pdf","rules":[{"name":"项目编号","pattern":"\\\\d+"}]}
```

Pipe to binary: `echo '{"file_path":"/tmp/test.pdf","rules":[]}' | ./dist/doc-handler`

Expected: `{"status":"ok","text":"[PDF content from /tmp/test.pdf - 0 bytes]","extracts":{}}`

- [ ] **Step 4: Commit**

```bash
git add doc-handler/
git commit -m "feat: initialize Go document processor with stub parsers"
```

---

## Phase 11: Polish & Testing

### Task 11: End-to-end testing and polish

**Files:**
- All frontend pages
- All backend routes
- Integration between services

**Steps:**
- [ ] **Step 1: Test full upload-to-preview flow**

Upload a sample PDF/DOCX file through the frontend.
Verify: File is saved, backend processes it, project info page shows extracted data.

- [ ] **Step 2: Test settings persistence**

Change theme, edit rules, modify export settings.
Verify: Changes persist across page reloads (localStorage + backend sync).

- [ ] **Step 3: Test API key management**

Add, edit, and delete API keys.
Verify: Keys are masked in UI, CRUD operations work.

- [ ] **Step 4: Polish UI details**

Ensure all colors, fonts, spacing match the Calicat designs.
Check responsive behavior.
Verify RemixIcon rendering.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: polish UI, add e2e testing, finalize bid extractor"
```

---

## Summary of Tasks

| Phase | Task | Scope |
|-------|------|-------|
| 1 | Project Scaffolding | Monorepo setup, 3 packages |
| 2 | Backend Foundation | Express server, SQLite, types |
| 3 | Backend APIs | Upload, projects, doc processor |
| 4 | Settings APIs | Rules, templates, theme, export, API keys |
| 5 | Frontend Foundation | Vue 3, router, theme store, layout |
| 6 | Upload Page | FileUploader component |
| 7 | Settings Pages | All 5 settings views |
| 8 | Project & Preview | ProjectForm, PreviewModal |
| 9 | API Integration | Connect frontend to backend |
| 10 | Go Doc Handler | Document parser binary |
| 11 | Polish & Testing | E2E flow, UI polish |
