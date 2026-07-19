import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './database.js';
import uploadRouter from './routes/upload.js';
import rulesRouter from './routes/rules.js';
import settingsRouter from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

initializeDatabase();

app.use('/api/upload', uploadRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/settings', settingsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;
