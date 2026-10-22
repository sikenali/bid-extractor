# 文取星 — 智能标书信息提取工具

<p align="center">
  <strong>officeparser 本地解析 · 规则化字段抽取 · 六大维度分类展示</strong>
</p>

<p align="center">
  <img src="frontend/public/logo-icon.svg" width="120" height="120" alt="文取星 Logo">
</p>

<p align="center">
  <img alt="Vue" src="https://img.shields.io/badge/Vue_3-3.4-4FC08D?logo=vue.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-11-003B57?logo=sqlite&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow">
</p>

## 软件介绍

文取星是一款专业的招标文件信息提取工具。在浏览器中上传 `.docx` 标书文档，服务端通过 **officeparser** 本地解析并依据规则表精准抽取结构化数据，按 **六大维度** 分类展示：项目信息、商务条款、技术条款、评分标准、封标信息、标星条款。所有解析均在本地完成，不依赖任何外部 AI 服务或第三方服务器，文档安全可控。

**核心功能**

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

## 技术实现

### 解析 → 规则抽取 → 结构化输出

系统采用三段式流水线：前端上传 `.docx` 后，后端通过 **officeparser** 解析为段落、章节、表格、页码等结构化元数据，随后依据 `extraction_rules` 规则表（正则 + 关键字）逐段匹配抽取字段，输出 `value + page + chapter + sourceText + paraIds` 溯源信息，最终前端按 6 大分类展示，字段旁显示溯源标签，点击定位预览页。

### 前端架构

Vue 3 + TypeScript + Vite 单页应用，配合 Pinia 状态管理与 Element Plus 组件库。8 个设置模块（主题 / 模板 / 技能 / 规则 / 模型 / 导出 / 个性 / 关于）通过 `SettingsLayout` 与 `SettingsSidebar` 组织，`TopNav` / `PageFooter` 构成统一布局骨架。文档预览通过 `@eigenpal/docx-editor-vue` 与 `@open-file-viewer/vue` 实现。

### 后端模式

Express + TypeScript 提供服务端 API，配合 SQLite（better-sqlite3）持久化规则与设置，AES 加密保护 API Key。支持上传缓存（jobStore TTL 1h）与规则 CRUD、技能导入/同步、纠错学习、模型连通性测试等接口。

### 桌面客户端

基于 Electron 构建 Windows / macOS / Linux 三平台原生应用。

```bash
# 安装依赖
npm install

# 开发模式（同时启动前端 + 后端 + Electron）
npm run electron:dev

# 打包 Windows exe
npm run build:desktop:win

# 打包 macOS dmg
npm run build:desktop:mac

# 打包 Linux AppImage
npm run build:desktop:linux
```

---

## 声明

1. **使用目的**：本工具旨在辅助招标文件信息提取，用户应自行核对最终结果的准确性。
2. **文档安全**：所有文档处理均在本地完成，不上传至任何第三方服务器，不依赖任何外部 LLM 服务。
3. **免责声明**：本工具按"现有状态"提供，不作任何形式的明示或默示保证。

## License

[MIT](./LICENSE)
