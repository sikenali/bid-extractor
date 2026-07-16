# 文制星 (Bid-Maker) 设计系统文档

> 生成日期：2026-07-08
> 基于项目实际实现与设计规范文档提取

---

## 一、颜色系统

### 1.1 主色调

| CSS 变量名 | 色值 | 用途 |
|-----------|------|------|
| parchment | `#FDF6E3` | 页面背景色（羊皮纸色） |
| cinnabar | `#C23B22` | 主品牌色（朱砂红），按钮/强调色 |
| cinnabar-dark | `#A83028` | 悬停状态 |
| gold | `#D4AF37` | 装饰色（金色） |
| gold-dark | `#C8A45C` | 模板设置激活色 |
| jade | `#2D8B57` | 成功状态（翡翠绿） |
| jade-light | `#5B8C5A` | 进度条颜色 |
| indigo-500 | `#6366F1` | API Key 管理激活色 |

### 1.2 文字与中性色

| 名称 | 色值 | 用途 |
|------|------|------|
| ink-black | `#2C2C2C` | 深色文字 |
| brown-dark | `#3D2B1F` | 主要文字色 |
| brown | `#5C4033` | 次要文字色 |
| brown-muted | `#8B7355` | 辅助/占位文字色 |
| tan-border | `#E0D5C0` | 边框色 |
| tan-dark | `#D4C4A8` | 分隔线色 |

### 1.3 背景层次

| 名称 | 色值 | 用途 |
|------|------|------|
| cream | `#FBF7EF` | 卡片背景 |
| cream-dark | `#F5EFE0` | 按钮默认背景 |
| cream-darker | `#F0E8D5` | 进度条背景 |
| warm-gray | `#EAE5D9` | 设置页右侧内容背景 |
| white | `#FFFFFF` | 设置卡片背景 |

### 1.4 主题模式

| 主题 | ID | 背景色 | 说明 |
|------|-----|--------|------|
| 浅色/羊皮纸 | light | `#FDF6E3` | 默认，古风风格 |
| 深色 | dark | `#2C2416` | 夜间模式 |
| 纯白 | paper | `#FFFFFF` | 简洁模式 |

---

## 二、字体系统

### 2.1 字体栈

```css
/* UI 界面文字 */
font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI',
             'Source Han Sans CN', 'Microsoft YaHei', sans-serif;

/* 书法风格标题 */
font-family: 'Ma Shan Zheng', cursive;

/* 小标题/装饰文字 */
font-family: 'ZCOOL XiaoWei', cursive;

/* 正文（宋体） */
font-family: 'Noto Serif SC', serif;
```

### 2.2 字号层级

| 用途 | 大小 | 字重 | 颜色 |
|------|------|------|------|
| 页面主标题 | 24px | 700 (Bold) | `#3D2B1F` |
| 页面副标题 | 14px | 400 (Regular) | `#9B8C7C` |
| 卡片标题 | 20px | 700 (Bold) | `#3D2B1F` |
| 卡片名称 | 15px | 600 (SemiBold) | 主题色 |
| 卡片描述 | 12px | 400 (Regular) | `#9B8C7C` / `#8B7355` |
| 导航栏品牌名 | 22px | 700 (Bold) | `#3D2B1F` |
| 导航栏副标题 | 12px | 400 | `#8B7355` |
| 设置侧边栏标签 | 15px | 600 (SemiBold) | `#3D2B1F` |
| 设置侧边栏子标签 | 11px | 400 | `#8B7355` |
| 正文 | 13px | 400 | `#3D2B1F` |
| 辅助文字 | 11px | 400 | `#8B7355` |

---

## 三、间距体系

| 层级 | 值 | 适用范围 |
|------|-----|---------|
| 4px | gap-1 | 小间距 |
| 8px | gap-2 | 图标间距 |
| 12px | gap-3 | 元素间距 |
| 16px | gap-4 / p-4 | 卡片内边距 |
| 20px | p-5 | 标题区域 |
| 24px | p-6 | 按钮内边距 |
| 32px | p-8 | 内容区边距 |
| 40px | p-10 | 大间距 |

---

## 四、圆角系统

| 层级 | 值 | 适用范围 |
|------|-----|---------|
| rounded-sm | 4px | 小图标按钮 |
| rounded | 6px | 菜单项 |
| rounded-lg | 8px | 按钮、输入框 |
| rounded-xl | 12px | 卡片、面板 |
| rounded-2xl | 16px | 大卡片 |
| rounded-full | 9999px | 圆形、选中标记 |

---

## 五、阴影系统

| 层级 | 值 | 适用范围 |
|------|-----|---------|
| shadow-sm | `0 1px 3px rgba(0,0,0,0.1)` | 小型指示器 |
| shadow-md | `0 4px 12px rgba(0,0,0,0.08)` | 卡片悬停 |
| shadow-lg | `0 8px 24px rgba(194,59,34,0.18)` | 选中卡片 |
| shadow-dropdown | `0 4px 16px rgba(0,0,0,0.12)` | 下拉菜单 |
| shadow-selected | `0 4px 20px rgba(196,61,61,0.1)` | 导出卡片选中 |

---

## 六、过渡与动画

### 6.1 通用过渡

```css
/* 按钮/交互元素 hover */
transition: all 0.2s;
transition: background 0.2s;
transition: border-color 0.2s, box-shadow 0.2s;

/* 颜色过渡 */
transition: color 0.2s;
transition: background 0.15s;

/* 进度条 */
transition: all 0.3s ease-out;
```

### 6.2 滑动指示器动画

```css
/* 设置页侧边栏指示器 */
transition: all 0.3s ease-out;

/* 大纲列表指示器 */
transition: top 0.35s ease-out, height 0.35s ease-out;
```

### 6.3 导航栏按钮展开

```css
.nav-btn {
  width: 40px;
  height: 40px;
  transition: all 0.2s;
}
.nav-btn:hover {
  width: 90px;
  background: #C23B22;
  border-color: transparent;
  color: #fff;
}
```

### 6.4 自定义下拉箭头旋转

```css
.picker-arrow {
  transition: transform 0.2s;
}
.picker-arrow.open {
  transform: rotate(180deg);
}
```

### 6.5 上传进度动画

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spin-icon {
  animation: spin 1.5s linear infinite;
}
```

### 6.6 交互特性

| 交互 | 描述 |
|------|------|
| 拖拽上传 | 拖拽文件时边框变色 (tan-dark → cinnabar)，背景加深 |
| 导航栏悬停 | 按钮从 40px 展开至 90px 并显示文字标签 |
| 侧边栏指示器 | 点击导航项时彩色指示器平滑滑动到对应位置 |
| 大纲指示器 | 选中章节时指示器平滑滑动 (0.35s ease-out) |
| 选中标记 | 圆圈背景色过渡切换 (tan-dark → cinnabar) |
| 模型下拉 | 箭头旋转 180° 打开/关闭 |
| 右键菜单 | 聚焦自动落在第一个菜单项，Tab 循环，Escape 关闭 |

---

## 七、图标系统

使用 **@remixicon/vue** (v4.9.0) 图标库。

| 组件 | 图标 | 用途 |
|------|------|------|
| RiRadarFill | 雷达 | Logo |
| RiQuestionLine | 问号 | 帮助按钮 |
| RiSettingsLine | 设置 | 设置按钮 |
| RiUploadCloudLine | 上传云 | 上传区域 |
| RiLoaderLine | 加载 | 上传中 |
| RiAddFill/Line | 加号 | 添加按钮 |
| RiSparklingFill | 星星 | AI 辅助 |
| RiSaveLine | 保存 | 保存按钮 |
| RiFileWord2Line | Word | Word 导出 |
| RiMarkdownLine | Markdown | MD 导出 |
| RiPaletteLine | 调色板 | 主题设置 |
| RiBookmarkLine | 书签 | 模板设置 |
| RiFileListLine | 列表 | 规则设置 |
| RiFileDownloadLine | 下载 | 导出设置 |
| RiKeyLine | 钥匙 | API Key |
| RiMore2Fill | 垂直三点 | 操作菜单 |
| RiCheckLine | 勾选 | 选中标记 |
| RiDeleteBinLine | 删除 | 删除操作 |
| RiEyeOffLine / RiEyeLine | 眼睛 | 密钥可见性切换 |
| RiArrowDownSLine | 下箭头 | 下拉箭头 |
| RiSendPlaneFill | 发送 | 发送消息 |
| RiFileTextFill/Line | 文件 | 大纲项 |
| RiArrowRightSLine | 右箭头 | 子目录缩进 |

---

## 八、布局结构

### 8.1 首页 (UploadView)

```
┌─────────────────────────────────┐
│        导航栏 (fixed 64px)      │
│  ┌──────┐               ┌────┐ │
│  │ Logo │ 文X星         │ 帮 │ │
│  └──────┘  Boomerang    │ 设 │ │
│                          └────┘ │
├─────────────────────────────────┤
│                                 │
│           主标题 (28px)          │
│           副标题 (16px)          │
│                                 │
│    ┌───────────────────────┐    │
│    │    上传卡片            │    │
│    │    (图标 80x80)        │    │
│    │    "拖拽或点击选择"     │    │
│    │    [选择文件] 按钮      │    │
│    └───────────────────────┘    │
│                                 │
│        进度条 (max-w 400px)      │
│                                 │
└─────────────────────────────────┘
```



### 8.2 设置页 (SettingsView)

```
┌─────────────────────────────────────────┐
│  导航栏                                  │
├──────────┬──────────────────────────────┤
│          │  标题栏 (图标 + 标题 + 按钮)  │
│ 侧边栏   │                              │
│ (280px)  │  ┌────────────────────────┐  │
│ cream    │  │  内容卡片               │  │
│          │  │  cream-dark bg          │  │
│ 标题     │  │  tan-border             │  │
│ ─────    │  │  rounded-2xl p-8        │  │
│ 设置项   │  └────────────────────────┘  │
│          │                              │
│ 指示器   │                              │
│ 滑动     │                              │
└──────────┴──────────────────────────────┘
```

---

## 九、组件样式规格

### 9.1 导航栏按钮

```css
width: 40px;         /* 默认 */
height: 40px;
border-radius: 8px;
background: #F5EFE0;
border: 0.7px solid #E0D5C0;
color: #5C4033;
transition: all 0.2s;

/* hover */
width: 90px;
background: #C23B22;
border-color: transparent;
color: #fff;
```

### 9.2 上传卡片

```css
border: 2px dashed #D4C4A8;
border-radius: 12px;
background: #FBF7EF;
padding: 60px 40px;

/* drag-over */
border-color: #C23B22;
background: rgba(194, 59, 34, 0.05);
```

### 9.3 设置侧边栏

```css
width: 280px;
background: #FBF7EF;
border-right: 1px solid #E0D5C0;
```

### 9.4 设置侧边栏导航按钮

```css
padding: 12px 16px;
border-radius: 12px;
font-size: 15px;
font-weight: 600;
```

### 9.5 设置侧边栏指示器

```css
position: absolute;
left: 16px;
right: 16px;
z-index: 0;
border-radius: 12px;
box-shadow: 0 1px 3px rgba(0,0,0,0.1);
transition: all 0.3s ease-out;
pointer-events: none;
```

### 9.6 主题卡片

```css
flex: 1;
background: #fff;
border-radius: 16px;
overflow: hidden;
border: 2px solid transparent;
transition: border-color 0.2s, box-shadow 0.2s;

/* 选中 */
border-color: #C23B22;
box-shadow: 0 4px 20px rgba(196, 61, 61, 0.15);
```

### 9.7 导出卡片

```css
flex: 1;
background: #fff;
border-radius: 16px;
padding: 32px;
border: 2px solid transparent;
transition: border-color 0.2s, box-shadow 0.2s;

/* 选中 */
border-color: #C23B22;
box-shadow: 0 4px 20px rgba(196, 61, 61, 0.1);
```




### 9.8 模板分类标签

```css
.tpl-tabs-wrap {
  display: flex;
  gap: 4px;
  background: #F0E8D5;
  border-radius: 12px;
  padding: 4px;
  width: fit-content;
}

.tpl-tab {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  background: transparent;
  color: #8B7355;
  font-weight: 500;
  white-space: nowrap;
}

.tpl-tab-active {
  background: #fff;
  color: #3D2B1F;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
```

---

## 十、主题系统

通过 `App.vue` 的 `theme-*` class 控制根节点：

```css
.theme-light  { background-color: #FDF6E3; }
.theme-dark   { background-color: #2C2416; color: #E8DCC8; }
.theme-paper  { background-color: #FFFFFF; }
```

使用 `settingsStore.setTheme()` 切换，数据通过 Pinia 全局共享。

---

## 十一、响应式设计

- 首页采用居中布局，最大宽度 800px
- 导航栏固定顶部，内容区域通过 `pt-16` 避开
- 设置页左右分栏，左侧 280px 固定，右侧自适应
- 三栏编辑器：左侧 260px + 中间 flex-1 + 右侧 300px
