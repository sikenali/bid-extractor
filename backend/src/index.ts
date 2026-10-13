import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database.js';
import uploadRouter from './routes/upload.js';
import rulesRouter, { bootApplyRegexPatterns, bootEnsureSeedSkills } from './routes/rules.js';
import settingsRouter, { bootSeedTemplates } from './routes/settings.js';
import llmPromptsRouter from './routes/llmPrompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

initializeDatabase();
bootEnsureSeedSkills();
bootApplyRegexPatterns();
bootSeedTemplates();

app.use('/api/upload', uploadRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/llm-prompts', llmPromptsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 生产环境：本地托管前端构建产物（frontend/dist），实现 single-origin 部署
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;
