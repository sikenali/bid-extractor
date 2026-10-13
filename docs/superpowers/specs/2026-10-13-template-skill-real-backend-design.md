# 模板管理去 mock + 技能导入/同步前后端打通 — 设计文档

日期：2026-10-13
决策：方案 A（前端去 mock + 后端补真实种子技能 + 接口小修），用户已批准并要求直接开发。

## 1. 目标

1. 模板管理页去掉 mock 数据兜底，走真实后端，失败报错、为空走空状态。
2. 技能管理页去掉 `MOCK_SKILLS`，导入技能 / 同步技能 / 恢复默认 / 删除 / 启停全部走真实后端并正确刷新。
3. 以技能文件（md + YAML frontmatter）为低代码载体：后端内置真实示例技能文件，同步能真正扫到并导入，导入能解析入库。

## 2. 范围

做：
- `frontend/src/views/settings/TemplateSettingsView.vue`：删 `getPlaceholderTemplates()` 及 catch 兜底；失败 `ElMessage.error` + 空列表。
- `frontend/src/views/settings/SkillSettingsView.vue`：删 `MOCK_SKILLS` 及两处兜底；reset 后 `loadSkills()` 重载；行点击切换 `expandedSkill`（接活已有详情 UI）；空状态文案引导导入/同步。
- `backend/src/routes/rules.ts`：
  - 新增 `bootEnsureSeedSkills()`（index.ts 调用，与 `bootSeedTemplates` 同模式）：`data/skills/` 为空时从 `backend/seed-skills/` 复制种子文件。
  - `POST /sync-skills`：目录不存在则创建；返回保持 `{synced, skills[], message?}`。
  - `POST /import-skill`：返回加 `isUpdate`（同名覆盖即更新），前端 toast 区分“已导入/已更新”。
  - `POST /reset-skills`：连带删除这些技能导入的规则（复用 delete-skill 的按 group+fields 删除逻辑），不再留孤儿规则。
  - 显式 `import crypto from 'node:crypto'`（现靠全局 WebCrypto，能跑但不可靠；settings.ts 同理顺手补）。
- 新增 `backend/seed-skills/`：5~6 个真实技能文件（info/business/tech/score/seal 各 1 个 rules 型 + 1 个纯 prompt 型），规则引用真实字段名。
- 清理 `backend/data/skills.json` 测试脏数据（“测试技能-项目信息提取”）。
- electron-builder `files` 加 `backend/seed-skills/**/*`（当前 files 不含 backend/data，种子必须随包发布）。

不做：
- 可视化低代码编排器（YAGNI）。
- 模板后端接口改动（已真实）、模板内容编辑/导入导出。
- 规则管理页改动（无回归即可）。

## 3. 数据流

- 同步：点击“同步技能”→ `POST /rules/sync-skills` → 为空则播种 → 扫描 `data/skills` → `parseSkillContent`（frontmatter→rules 入库；无 rules→prompt 存 content）→ `saveSkillMeta` → `{synced, skills[]}` → toast + `loadSkills()`。
- 导入：选文件（.md/.yaml/.yml）→ multipart `POST /rules/import-skill` → 同解析流程 → `{name, inserted, skipped, count, isUpdate}` → toast → `loadSkills()`。
- 列表：`GET /rules/skills` = skills.json 元数据 + extraction_rules 按 fields+group 关联。

## 4. 错误处理

- 前端：加载失败 toast + 空列表；导入/同步失败展示后端中文 error。
- 后端：multer 1MB 超限 / 解析异常 / 非法 frontmatter → 400 + 中文 error。

## 5. 验证

- 后端 `tsc` 通过；curl 验证 sync/import/list/reset/toggle/delete。
- 前端 dev 联调：空库 → 同步出 5~6 个技能 → 导入更新 → 删除 → reset 清空。
- 确认规则管理页无回归。

## 6. 自检记录

- 无 TBD/占位；架构与特性描述一致；单批可交付，无需拆分；种子随包发布路径已明确（dev `src` 与 prod `dist` 均用 `__dirname/../../seed-skills`）。
