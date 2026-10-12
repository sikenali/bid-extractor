# 文取猩 · 智能标书解决方案平台

<p align="center">
  <strong>从招标文件中精准提取结构化数据 · officeparser 本地解析 · 跨平台（Windows / macOS / Linux）</strong>
</p>

<p align="center">
  <img src="frontend/public/logo.svg" width="120" height="120" alt="文取猩 Logo">
</p>

<p align="center">
  <img alt="Vue" src="https://img.shields.io/badge/Vue_3-3.4-4FC08D?logo=vue.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-11-003B57?logo=sqlite&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow">
</p>

<p align="center">
  <a href="#软件介绍">软件介绍</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#代码架构">代码架构</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#多平台发布">多平台发布</a>
</p>

---

## 软件介绍

文取猩是一款专业的招标文件信息提取工具，在浏览器中上传 `.docx` 标书文档，服务端通过 **officeparser** 本地解析并依据规则表精准抽取结构化数据，按 **六大维度** 分类展示：项目信息、商务条款、技术条款、评分标准、封标信息、标星条款。

所有解析均在本地完成，不依赖任何外部 AI 服务或第三方服务器，文档安全可控。

## 功能特性

| 功能 | 说明 |
|------|------|
| 文档解析 | 基于 officeparser 的纯 Node.js 解析，输出段落、章节、表格、页码及标星符号条款 |
| 规则提取 | 依据 `extraction_rules` 规则表（**正则 + 关键字**）逐字段抽取，输出值 + 页码 + 章节 + 溯源原文 |
| 六大分类 | 按 项目信息 / 商务条款 / 技术条款 / 评分标准 / 封标信息 / 标星条款 分组展示与过滤 |
| 正则描述 | 关键字段内置精确正则（金额/时间/编号/份数等），启动时自动迁移补齐 |
| 在线预览 | 集成 DocxEditor，浏览器内直接预览原文档，支持按页定位 |
| 导出 | 支持 Word (DOCX) 与 Markdown 两种格式导出，含字段表格 |
| 纠错学习 | 手动修正提取结果后自动生成/更新规则 |
| 技能导入 | 上传 `.md` / `.yaml` 技能包，扩展提取规则（YAML frontmatter / 纯 Markdown Prompt） |
| 技能同步 | 扫描本地 `backend/data/skills/*.md` 目录批量导入已安装技能 |
| 主题系统 | 羊皮纸 / 墨夜 / 白纸 三套主题 + 五档强调色（朱红/鎏金/玉绿/云蓝/黛墨）+ 顶栏/侧栏布局切换 |
| 设置中心 | 主题、模板、技能、规则、模型（API Key）、导出、个性设置、关于 八个模块 |

## 代码架构

```
bid-extractor/
├── frontend/                       # Vue 3 前端 (Vite)
│   ├── src/
│   │   ├── api/                    # API 客户端 (client / rules / settings / upload)
│   │   ├── components/
│   │   │   ├── layout/             # TopNav / SettingsSidebar / SettingsLayout / PageFooter
│   │   │   ├── preview/            # 文档预览 (PreviewModal)
│   │   │   ├── upload/             # 文件上传 (FileUploader / UploadCard)
│   │   │   ├── settings/           # 设置组件 (RuleDialog 等)
│   │   │   └── ui/                 # 通用 UI (UiButton / UiInput / UiSwitch …)
│   │   ├── constants/brand.ts      # 品牌统一变量 (BRAND_NAME / BRAND_TITLE)
│   │   ├── stores/theme.ts         # 主题 / 强调色 管理 (Pinia)
│   │   ├── views/
│   │   │   ├── UploadView.vue      # 上传页
│   │   │   ├── ProjectView.vue     # 提取结果页 (六分类表格)
│   │   │   └── settings/           # 设置页 (主题/模板/技能/规则/模型/导出/个性/关于)
│   │   ├── router/index.ts         # 路由配置
│   │   └── main.ts                 # 入口 (动态设置浏览器标题)
│   ├── public/logo.svg
│   └── vite.config.ts
│
├── backend/                        # Express.js 后端 (TypeScript)
│   ├── src/
│   │   ├── database.ts             # SQLite 初始化 + AES 加密 + 迁移
│   │   ├── index.ts                # Express 入口
│   │   ├── types.ts
│   │   ├── routes/
│   │   │   ├── upload.ts           # 上传 + 解析结果缓存
│   │   │   ├── rules.ts            # 规则 CRUD + 技能导入/同步 + 纠错学习
│   │   │   └── settings.ts         # 主题 / 导出 / API Key
│   │   └── services/
│   │       └── docProcessor.ts     # officeparser 解析 + 规则抽取
│   ├── data/skills/                # 本地技能目录 (同步技能读取)
│   └── package.json
│
├── data/                           # 运行时数据 (SQLite + 加密密钥)
├── .github/workflows/release.yml   # 三平台构建发布
└── package.json                    # npm workspace 根
```

**提取流程**

```
前端上传 .docx → POST /api/upload
    ↓
officeparser 本地解析 → paragraphsMeta / tablesMeta / chapters / markedItems / paraToPage
    ↓
依据 extraction_rules（正则/关键字，enabled=1）逐段匹配抽取
    输出 value + page + chapter + sourceText + paraIds 溯源
    ↓
结构化 JSON → jobStore (TTL 1h)
    ↓
前端展示 6 分类结果，字段旁显示溯源标签，点击定位预览页
```

## 提取规则

规则表是抽取的核心，内置 **6 大分类** 的字段定义与正则式描述：

| 分类 | 说明 | 关键正则字段 |
|------|------|-------------|
| 项目信息 (info) | 项目名称 / 编号 / 方式 / 金额 / 时间 / 地点 / 保证金 / 采购人 | 项目编号、预算金额、投标截止时间、开标时间、投标地点 |
| 商务条款 (business) | 付款 / 质保 / 履约保证金 / 交货期 / 有效期 / 联合体 | 付款方式、质保期、交货期、履约保证金 |
| 技术条款 (tech) | 规格 / 指标 / 参数 / 验收 / 性能 | 技术规格、技术指标、技术参数、验收标准、性能要求 |
| 评分标准 (score) | 评标办法 / 各种评分 / 权重 / 满分 | 评标办法、价格/技术/商务评分、满分值 |
| 封标信息 (seal) | 密封 / 封装 / 正本 / 副本 | 密封要求、正本数量、副本数量、密封袋标识 |
| 标星条款 (star) | ★▲●◆※* 等关键标识条款 | 动态符号类 |

> 关键字段的正则通过 `REGEX_PATTERNS` 映射定义，服务启动时自动将已有 keyword 规则升级为 regex。

**技能扩展**

- **导入技能**：上传 `.md` / `.yaml` 技能包，支持 YAML frontmatter 规则或纯 Markdown Prompt
- **同步技能**：点击「同步技能」读取本地 `backend/data/skills/*.md` 批量导入

## 快速开始

### 前置条件

- **Node.js** ≥ 20
- **npm**

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 同时启动前端 + 后端
npm run dev

# 或分别启动
npm run dev:frontend    # 前端 http://localhost:5173
npm run dev:backend     # 后端 http://localhost:3000
```

### 生产构建

```bash
npm run build
# 产物:
#   frontend/dist/   — 静态文件
#   backend/dist/    — TypeScript 编译输出
```

### 生产运行（后端 + 静态前端）

```bash
cd backend && npm run build && npm start
# 默认端口 3000，健康检查: http://localhost:3000/health
```

### Docker 部署

```dockerfile
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## 多平台发布

项目通过 GitHub Actions 自动为 **Windows / macOS / Linux** 三个平台构建产物并发布到 GitHub Release。

- **触发方式**：推送 `v*` 标签，或手动运行 `Release` workflow
- **产物**：各平台的 `frontend/dist` + `backend/dist` 归档压缩包
  - Windows → `.zip`
  - macOS / Linux → `.tar.gz`

```bash
# 发布示例
git tag v1.0.0
git push origin v1.0.0
```

发布后可在 [Releases](../../releases) 页面下载对应平台的构建产物。

## 设置中心

| 模块 | 说明 |
|------|------|
| 主题管理 | 外观主题、强调色、布局切换（顶栏/侧栏） |
| 模板管理 | 招标 / 标书 / 自定义模板（列表/卡片视图切换） |
| 技能管理 | 导入 / 同步 / 启用 / 删除技能（列表/卡片视图切换） |
| 规则管理 | 六分类规则 CRUD、正则描述、关键字别名 |
| 模型管理 | 厂商（国内/国外）快速配置 + 自定义 API Key，支持连通性测试 |
| 导出管理 | Word / PDF / Markdown 导出设置 |
| 个性设置 | 界面密度、行为偏好 |
| 关于 | 版本信息、开源仓库、版权声明 |

## 声明

1. **使用目的**：本工具旨在辅助招标文件信息提取，用户应自行核对最终结果的准确性。
2. **文档安全**：所有文档处理均在本地完成，不上传至任何第三方服务器，不依赖任何外部 LLM 服务。
3. **免责声明**：本工具按"现有状态"提供，不作任何形式的明示或默示保证。

## License

[MIT](./LICENSE)