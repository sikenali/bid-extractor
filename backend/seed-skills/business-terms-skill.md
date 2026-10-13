---
name: 商务条款抽取技能
description: 抽取付款方式、质保期、履约保证金、交货期与投标有效期等商务条款字段
group: business
rules:
  - field: 付款方式
    type: regex
    pattern: '(?:付款|支付)(?:方式|条件)?[：:]?\s*([^，。\n；;]{4,40})'
  - field: 质保期
    type: regex
    pattern: '(?:质保期|质量保证期|保修期|质保期限)[：:]?\s*([^，。\n；;]{2,30})'
  - field: 履约保证金
    type: regex
    pattern: '(?:履约)?保证金[：:]?\s*(?:人民币\s*)?[¥￥]?\s*([^，。\n；;]{2,40})'
  - field: 交货期
    type: keyword
  - field: 投标有效期
    type: keyword
---

# 商务条款抽取技能

本技能用于抽取商务条款类字段，覆盖付款、质保、履约担保、交货与投标有效期。
否决投标（废标）相关条款请逐条拆分，一条为一项。
