# 文取猩 — 文档智能提取平台

<p align="center">
  <strong>从招标文件中精准提取结构化数据 · 规则引擎 + AI 增强 · 跨平台桌面/Web 部署</strong>
</p>

<p align="center">
  <img src="frontend/public/logo.svg" width="120" height="120" alt="文取猩 Logo">
</p>

<p align="center">
  <img alt="Vue" src="https://img.shields.io/badge/Vue_3-3.4-4FC08D?logo=vue.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white">
  <img alt="Go" src="https://img.shields.io/badge/Go-1.24-00ADD8?logo=go&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-11-003B57?logo=sqlite&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow">
</p>

## 软件介绍

文取猩是一款专业招标文件信息提取工具，从 `.docx` 文档中精准抽取结构化数据，按六大维度分类展示：项目信息、商务条款、技术条款、评分标准、封标要求、标星条款。

**核心功能**

| 功能 | 说明 |
|------|------|
| 文档解析 | 基于 unioffice 的 Go 高性能文档处理器，提取段落、章节、表格、页码 |
| 规则引擎 | 160+ 内置提取规则（正则 + 关键字），覆盖 6 大分类，支持自定义扩展 |
| 智能提取 | 段落级正则匹配、关键字双向搜索、表格全单元格搜索、结构化值提取 |
| AI 增强 | 可选 LLM 智能提取，自动补全规则引擎遗漏的字段 |
| 在线预览 | 集成 DocxEditor，浏览器内直接预览原文档，支持缩放 |
| 导出 | 支持 Word (DOCX) 和 Markdown 两种格式导出，含字段表格 |
| 纠错学习 | 手动修正提取结果后自动学习，生成新规则 |
| 技能导入 | 通过 `.md` / `.yaml` 文件导入自定义技能包，扩展提取能力 |
| 主题切换 | 羊皮纸 / 暗色 / 白纸三种主题，全局即时生效 |

## 代码架构

```
bid-extractor/
├── frontend/                       # Vue 3 前端 (bid-extractor-frontend)
│   ├── src/
│   │   ├── api/                    # API 客户端
│   │   │   ├── client.ts           # Axios 实例 + 拦截器
│   │   │   ├── rules.ts            # 规则管理 API
│   │   │   ├── settings.ts         # 设置 API
│   │   │   └── upload.ts           # 上传/解析 API
│   │   ├── components/
│   │   │   ├── layout/             # 布局组件 (TopNav, SettingsSidebar)
│   │   │   ├── preview/            # 文档预览 (PreviewModal)
│   │   │   ├── upload/             # 文件上传 (FileUploader)
│   │   │   └── settings/           # 设置组件 (RuleDialog)
│   │   ├── stores/                 # Pinia 状态管理
│   │   │   └── theme.ts            # 主题切换
│   │   ├── views/                  # 页面视图
│   │   │   ├── UploadView.vue      # 上传页
│   │   │   ├── ProjectView.vue     # 提取结果页 (6 标签)
│   │   │   └── settings/           # 设置页 (主题/规则/技能/导出/API Key)
│   │   ├── router/index.ts         # 路由配置
│   │   └── main.ts                 # 应用入口
│   ├── public/logo.svg             # Logo
│   ├── vite.config.ts              # Vite 构建配置
│   └── package.json
│
├── backend/                        # Express.js 后端 (bid-extractor-backend)
│   ├── src/
│   │   ├── database.ts             # SQLite 初始化 + 加密模块 + 迁移
│   │   ├── index.ts                # Express 应用入口
│   │   ├── types.ts                # TypeScript 类型定义
│   │   ├── routes/
│   │   │   ├── upload.ts           # 文件上传 + 解析结果缓存
│   │   │   ├── rules.ts            # 规则 CRUD + 技能导入 + 纠错学习
│   │   │   └── settings.ts         # 主题/导出/API Key 设置
│   │   └── services/
│   │       ├── docProcessor.ts     # Go 子进程编排
│   │       └── llmExtractor.ts     # LLM 增强提取
│   ├── doc-handler/                # Go 文档解析器 (bid-extractor-doc-handler)
│   │   ├── main.go                 # 核心解析逻辑
│   │   └── go.mod                  # Go 依赖管理
│   └── package.json
│
├── data/                           # 运行时数据
│   ├── bid-extractor.db            # SQLite 数据库
│   └── .enc_key                    # AES-256 加密密钥 (自动生成)
│
├── uploads/                        # 上传文件缓存 (24h 自动清理)
└── package.json                    # 根 workspace
```

## 提取流程

```
用户上传 .docx
    ↓
POST /api/upload → multer 保存到 uploads/
    ↓
parseDocument() → 查询 SQLite 中 enabled=1 的规则 (161 条)
    ↓
spawn Go 子进程 → 传入 file_path + rules JSON
    ↓
Go 解析 docx (unidoc/unioffice):
  ├─ extractDocxWithChapters() → 段落 / 章节 / 表格 / 页码
  ├─ applyRules() → 正则匹配 + 关键字搜索 + 表格提取
  │   ├─ 段落级正则回退 (避免跨段误匹配)
  │   ├─ keyword 双向搜索 (前后对比评分)
  │   ├─ 全局优先 + 分组兜底 scope
  │   └─ 方法优先级: 表格 > 正则 > keyword > 兜底
  ├─ extractMarkedItems() → ★▲● 等标星条款检测
  └─ findFieldParagraphs() → 字段→段落→页码映射
    ↓
Go 输出 JSON → stdout → Node.js 接收
    ↓
存入 jobStore (TTL 1h, 10min 清理)
    ↓
前端 GET /api/upload/:id/status → 展示 6 标签提取结果
    ↓
可选: POST /api/upload/:id/refine → LLM 增强提取
```

## 部署说明

### 前置条件

- **Node.js** ≥ 18
- **Go** ≥ 1.24
- **npm** 或 **pnpm**

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 编译 Go 文档处理器
cd backend/doc-handler
go build -o dist/doc-handler .
cd ../..

# 3. 启动开发服务器 (同时启动前端 + 后端)
npm run dev

# 或分别启动
npm run dev:frontend   # 前端 http://localhost:5173
npm run dev:backend    # 后端 http://localhost:3000
```

### 生产构建

```bash
# 构建所有 workspace
npm run build

# 产物:
#   frontend/dist/       — 静态文件
#   backend/dist/        — TypeScript 编译输出
#   backend/doc-handler/dist/doc-handler — Go 二进制
```

### Docker 部署 (推荐)

```dockerfile
FROM golang:1.24-alpine AS doc-handler
WORKDIR /app
COPY backend/doc-handler/go.mod backend/doc-handler/go.sum ./
RUN go mod download
COPY backend/doc-handler/main.go .
RUN go build -o /doc-handler .

FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/dist/ ./dist/
COPY --from=doc-handler /doc-handler ./doc-handler/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Nginx 配置

```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /path/to/frontend/dist;
  index index.html;

  # SPA 路由支持
  location / {
    try_files $uri $uri/ /index.html;
  }

  # 静态资源缓存
  location /assets {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API 代理
  location /api/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## 提取规则

内置 **160+ 条规则**，覆盖 6 大分类：

| 分类 | 正则规则 | 关键字规则 | 说明 |
|------|---------|-----------|------|
| 项目信息 (info) | 17 | 3 | 项目名称、编号、预算、时间等 |
| 商务条款 (business) | 29 | 0 | 付款方式、质保、资质等 |
| 技术条款 (tech) | 18 | 17 | 技术参数、功能要求、验收标准等 |
| 评分标准 (score) | 16 | 10 | 价格/技术/商务评分、满分等 |
| 封标要求 (seal) | 7 | 23 | 密封、封装、正本/副本等 |
| 标星信息 (star) | 7 | 14 | ★▲● 等关键标识条款 |

### 自定义规则

通过 **技能导入** 功能扩展提取能力：

1. 进入 `设置 → 添加技能`
2. 上传 `.md` 或 `.yaml` 格式的技能文件
3. 支持 YAML frontmatter 定义规则和字段映射
4. 也可上传纯 Markdown 作为 Prompt 技能

## 声明

1. **使用目的**：本工具旨在辅助招标文件信息提取，用户应自行核对最终结果的准确性。
2. **文档安全**：所有文档处理均在本地完成，不上传至任何第三方服务器。AI 增强提取仅在用户主动触发时，将文档文本发送至用户配置的 API 端点。
3. **免责声明**：本工具按"现有状态"提供，不作任何形式的明示或默示保证。作者或版权持有人不对因使用本工具而产生的任何损失或责任负责。

## License

[MIT](./LICENSE)
