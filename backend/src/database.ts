import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bid-extractor.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function uid() {
  return crypto.randomUUID();
}

export function initializeDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS extraction_rules (
    id TEXT PRIMARY KEY,
    field_name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    category TEXT DEFAULT 'regex'
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS api_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    region TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS export_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    format TEXT DEFAULT 'docx',
    include_table_of_contents INTEGER DEFAULT 1,
    page_numbers INTEGER DEFAULT 1,
      header_footer INTEGER DEFAULT 1
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS theme_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    type TEXT DEFAULT 'parchment'
  )`);

  db.exec(`INSERT OR IGNORE INTO export_settings (id) VALUES (1)`);
  db.exec(`INSERT OR IGNORE INTO theme_config (id) VALUES (1)`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '项目编号', '(?:项目|招标)\\\\s*编号[：:]\\\\s*([A-Z]{2,4}[-_]\\\\d{4}[-_]\\\\d{4})', 'regex')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '投标保证金', '投标\\\\s*保证金[：:]\\\\s*(?:人民币\\\\s*)?[¥￥]?\\\\s*(\\\\d,+(?:\\\\.\\\\d{2})?)\\\\s*元?', 'regex')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '投标截止时间', '投标\\\\s*(?:截止|递交).*?时间[：:]\\\\s*(\\\\d{4}年\\\\d{1,2}月\\\\d{1,2}日\\\\s*\\\\d{1,2}:\\\\d{2})', 'regex')`);

  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '废标', '', 'keyword')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '无效投标', '', 'keyword')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '实质性响应', '', 'keyword')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '★号条款', '', 'keyword')`);
  db.exec(`INSERT INTO extraction_rules (id, field_name, pattern, category) VALUES (${uid()}, '否决投标', '', 'keyword')`);

  db.exec(`INSERT INTO templates (id, type, category, name, description) VALUES (${uid()}, 'bidding', 'government', '政府采购货物类', '适用于货物类采购项目')`);
  db.exec(`INSERT INTO templates (id, type, category, name, description) VALUES (${uid()}, 'bidding', 'engineering', '工程施工类', '适用于工程施工招标')`);
  db.exec(`INSERT INTO templates (id, type, category, name, description) VALUES (${uid()}, 'bidding', 'it_service', '信息化服务类', '适用于IT服务采购')`);
  db.exec(`INSERT INTO templates (id, type, category, name, description) VALUES (${uid()}, 'bidding', 'consulting', '咨询服务类', '适用于咨询类采购')`);

  db.exec(`INSERT INTO api_configs (id, provider, model, api_key) VALUES (${uid()}, '阿里云', 'qwen-turbo', '')`);
  db.exec(`INSERT INTO api_configs (id, provider, model, api_key) VALUES (${uid()}, '百度', 'ernie-bot', '')`);
  db.exec(`INSERT INTO api_configs (id, provider, model, api_key) VALUES (${uid()}, '智谱', 'glm-4', '')`);
}

export { db };
