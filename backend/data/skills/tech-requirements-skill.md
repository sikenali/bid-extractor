---
name: 技术要求抽取技能
description: 抽取技术规格、技术参数、性能要求与验收标准等技术条款字段
group: tech
rules:
  - field: 技术规格
    type: regex
    pattern: '技术规格[：:]?\s*([^，。\n；;]{4,60})'
  - field: 技术参数
    type: regex
    pattern: '技术参数[：:]?\s*([^，。\n；;]{4,60})'
  - field: 验收标准
    type: regex
    pattern: '验收标准[：:]?\s*([^，。\n；;]{4,60})'
  - field: 性能要求
    type: keyword
  - field: 服务内容
    type: keyword
---

# 技术要求抽取技能

本技能用于抽取技术条款类字段，保留原文表述，不改写、不总结，缺失字段填空。
