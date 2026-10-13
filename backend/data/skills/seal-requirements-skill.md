---
name: 封标要求抽取技能
description: 抽取正副本份数、密封要求与递交方式等封标信息字段
group: seal
rules:
  - field: 密封要求
    type: regex
    pattern: '密封要求[：:]?\s*([^，。\n；;]{4,60})'
  - field: 正本数量
    type: regex
    pattern: '正本\s*(\d+)\s*份'
  - field: 副本数量
    type: regex
    pattern: '副本\s*(\d+)\s*份'
  - field: 递交方式
    type: keyword
  - field: 密封条完整性
    type: keyword
---

# 封标要求抽取技能

本技能用于抽取封标信息类字段：正副本份数、密封要求、标记要求逐条提取，
保留原文，不改写。
