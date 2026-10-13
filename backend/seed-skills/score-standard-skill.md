---
name: 评分标准抽取技能
description: 抽取评标办法、价格/技术/商务评分与满分值等评分标准字段
group: score
rules:
  - field: 评标办法
    type: regex
    pattern: '评标办法[：:]?\s*([^，。\n；;]{2,40})'
  - field: 价格评分
    type: regex
    pattern: '价格(?:评分|得分)[：:]?\s*(\d+(?:\.\d+)?)\s*分'
  - field: 技术评分
    type: regex
    pattern: '技术(?:评分|得分)[：:]?\s*(\d+(?:\.\d+)?)\s*分'
  - field: 商务评分
    type: regex
    pattern: '商务(?:评分|得分)[：:]?\s*(\d+(?:\.\d+)?)\s*分'
  - field: 满分值
    type: keyword
---

# 评分标准抽取技能

本技能用于抽取评分标准类字段，分值数值必须准确，并做总分校验。
