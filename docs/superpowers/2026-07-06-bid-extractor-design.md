# Bid Extractor (文取猩/文取猩) - Design Document

**Date:** 2026-07-06
**Status:** Approved
**Source Designs:** Calicat File `2072521628460605440`

## Overview

A bidding document extraction tool called "文取猩" (Boomerang) / "文取猩" that parses tender/bidding documents (PDF, DOCX, DOC) and extracts structured project information using configurable regex rules and keywords.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + Vite + TypeScript + Element Plus + Vue Router |
| Backend API | Node.js + Express + SQLite |
| Document Processing | Go + unioffice (invoked as child process) |
| File Storage | Local filesystem |
| Icons | RemixIcon |

## Pages (8 total)

### 1. Upload Page (上传状态)
- **Route:** `/upload`
- **Components:**
  - Top navigation bar (logo, brand name "文取猩 Boomerang", help/settings buttons)
  - File upload area with drag-and-drop support
  - Supports PDF, DOCX, DOC formats, max 50MB per file
  - Red primary button "选择文件" with upload icon
  - Secondary text "或拖拽文件到此处"
- **Colors:** Warm beige theme (`#FBF7F0` background, `#C43D3D` accent)

### 2. Project Information (项目信息)
- **Route:** `/project`
- **Purpose:** Form to collect extracted project metadata
- **Fields:** Project name, bidding number, tender organization, budget, timeline, etc.
- **Layout:** Two-column form with validation

### 3. Preview Modal (预览招标文件弹窗)
- **Component:** Modal overlay (900x753px)
- **Features:**
  - Header with filename and close button
  - Toolbar: page navigation (prev/next), page number input, zoom controls (minus/plus/percentage)
  - Search button, download button (red)
  - PDF page simulation area with white paper on gray background
  - Shadow effects for depth
- **Integration:** Opens after file upload and parsing

### 4. Settings - Theme (主题设置)
- **Route:** `/settings/theme`
- **Sidebar Navigation:** 5 setting categories (theme, template, rules, export, API Key)
- **Theme Cards (3 options):**
  - 羊皮纸 (Parchment) - warm beige, default, red border when selected
  - 墨夜 (Dark Night) - dark blue/black theme
  - 白纸 (White Paper) - clean white/minimal
- **Each card:** Preview thumbnail (mini UI mockup) + name + description + selection indicator

### 5. Settings - Template (模板设置)
- **Route:** `/settings/template`
- **Tab Switcher:** 招标模板 / 投标模板 / 自定义模板
- **Template Shelf:** Card grid (200px each)
  - 政府采购货物类, 工程施工类, 信息化服务类, 咨询服务类
  - Each card: gradient cover, icon, title, subtitle, description
  - "添加模板" card with plus icon
- **Cover gradients:** Different colors per template category

### 6. Settings - Rules (规则设置)
- **Route:** `/settings/rules`
- **Section 1: Regex Rules**
  - Table with columns: 字段名称, 正则表达式, 操作
  - Sample rules: 项目编号, 投标保证金, 投标截止时间
  - Actions: edit (pencil icon), delete (trash icon)
  - "添加规则" button
- **Section 2: Keyword Matching**
  - Tag/pill style keywords: 废标, 无效投标, 实质性响应, ★号条款, 否决投标
  - Each tag has a remove (x) button
  - "添加" tag to add new keywords

### 7. Settings - Export (导出设置)
- **Route:** `/settings/export`
- **Format Cards (side by side):**
  - Word (.docx) - selected by default, red border
    - Features: 保留格式排版, 支持表格/图片/页眉页脚, 兼容Word/WPS, 支持目录自动生成
  - Markdown (.md)
    - Features: 纯文本格式, 适合版本管理, 可转HTML/PDF, 兼容Markdown编辑器
- **Each card:** Icon, format name, extension, feature checklist, selection indicator

### 8. Settings - API Key (API Key)
- **Route:** `/settings/apikey`
- **Left Panel (Model List, 260px):**
  - Section: 国内模型 - 通义千问 (selected), 文心一言, 智谱GLM
  - Section: 国外模型 - GPT-4o, Claude 3.5
- **Right Panel (Configuration):**
  - Tab switcher: 模型制造商 / 自定义配置
  - Form fields: 服务商 (dropdown), 模型 (input), API Key (masked with show/hide)
  - Buttons: 取消 (secondary), 添加 (primary red)

## Shared Layout

### Top Navigation Bar
- Height: 64px, padding: 0 24px
- Logo: 40x40px red circle with RemixIcon
- Brand: "文取猩 Boomerang" (SourceHanSans Bold 22px + Regular 12px)
- Right: Help button, Settings button (RemixIcon)

### Settings Sidebar
- Width: 220px, background: `#F5EFE3`
- Title: "系统设置" (11px, muted color)
- Menu items: 36x height, 12px gap, 12px rounded corners
- Active state: Red fill `#C43D3D`, white text/icon
- Inactive: Beige background, dark text

## Design Tokens

```css
/* Colors */
--color-primary: #C43D3D;        /* Red accent */
--color-bg-main: #FBF7F0;        /* Warm beige background */
--color-bg-secondary: #F5EFE3;   /* Sidebar/lighter panels */
--color-bg-card: #F5E8D8;        /* Card hover/disabled */
--color-bg-white: #FFFFFF;       /* White surfaces */
--color-text-primary: #3D2B1F;   /* Dark brown text */
--color-text-secondary: #8B7355; /* Muted text */
--color-text-muted: #9B8C7C;     /* Placeholder text */
--color-border: #D4C5A9;         /* Border color */

/* Typography */
--font-family-cn: "SourceHanSans", sans-serif;
--font-family-icon: "remixicon";

/* Font sizes */
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

/* Spacing scale */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 12px;
--spacing-lg: 16px;
--spacing-xl: 24px;
--spacing-2xl: 32px;

/* Border radius */
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-full: 9999px;
```

## Data Models

### Project
```typescript
interface Project {
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
```

### ExtractionRule
```typescript
interface ExtractionRule {
  id: string;
  fieldName: string;
  pattern: string;
  enabled: boolean;
  category: 'regex' | 'keyword';
}
```

### Template
```typescript
interface Template {
  id: string;
  type: 'bidding' | 'proposal' | 'custom';
  category: string;
  name: string;
  description: string;
  coverGradient: string;
  coverIcon: string;
}
```

### Theme
```typescript
type ThemeType = 'parchment' | 'dark' | 'white';

interface ThemeConfig {
  type: ThemeType;
  colors: Record<string, string>;
  fonts: Record<string, string>;
}
```

### ApiConfig
```typescript
interface ApiConfig {
  id: string;
  provider: string;       // 阿里云, 百度, 智谱, OpenAI, Anthropic
  model: string;          // qwen-turbo, ernie-bot, glm-4, gpt-4o, claude-3.5
  apiKey: string;         // masked in UI
  region?: string;
}
```

### ExportSetting
```typescript
interface ExportSetting {
  format: 'docx' | 'markdown';
  includeTableOfContents: boolean;
  pageNumbers: boolean;
  headerFooter: boolean;
}
```

## API Endpoints

### File Upload
```
POST   /api/upload           # Upload bidding document
GET    /api/upload/:id/status # Check parsing status
GET    /api/upload/:id/result # Get parsed result
DELETE /api/upload/:id        # Delete uploaded file
```

### Project
```
GET    /api/projects          # List projects
POST   /api/projects          # Create/update project info
GET    /api/projects/:id      # Get project details
PUT    /api/projects/:id      # Update project
DELETE /api/projects/:id      # Delete project
```

### Rules
```
GET    /api/rules             # List all rules
POST   /api/rules             # Add new rule
PUT    /api/rules/:id         # Update rule
DELETE /api/rules/:id         # Delete rule
```

### Templates
```
GET    /api/templates         # List templates
POST   /api/templates         # Create custom template
PUT    /api/templates/:id     # Update template
DELETE /api/templates/:id     # Delete template
```

### Settings
```
GET    /api/settings/theme    # Get current theme
PUT    /api/settings/theme    # Update theme
GET    /api/settings/export   # Get export settings
PUT    /api/settings/export   # Update export settings
GET    /api/settings/apikeys  # List API configs
POST   /api/settings/apikeys  # Add API config
PUT    /api/settings/apikeys/:id # Update API config
DELETE /api/settings/apikeys/:id # Delete API config
```

## Go Doc Handler (Child Process)

The Go service with unioffice is invoked as a child process from Node.js:

```go
// Main functionality:
// 1. Parse PDF/DOCX/DOC files
// 2. Extract text content
// 3. Apply regex rules to extract structured fields
// 4. Generate output in configured format (docx/markdown)
```

Communication via stdin/stdout (JSON protocol) or temporary files.

## Routing Structure

```
/                    → Redirect to /upload
/upload              → UploadPage
/project/:id         → ProjectInfoPage
/preview             → PreviewModal (overlay)
/settings            → Redirect to /settings/theme
/settings/theme      → ThemeSettingsPage
/settings/template   → TemplateSettingsPage
/settings/rules      → RulesSettingsPage
/settings/export     → ExportSettingsPage
/settings/apikey     → ApiKeySettingsPage
```

## State Management

- **Frontend:** Pinia for global state (theme, current project, API configs)
- **Local storage:** Theme preference, settings persistence
- **Backend:** SQLite for all persisted data

## Non-functional Requirements

- File upload limit: 50MB per file
- Supported formats: PDF, DOCX, DOC
- Response time for parsing: < 30 seconds for typical documents
- Theme switching: instant, no page reload
- Settings persistence: auto-save on change
- API key masking: always show masked value with toggle to reveal
