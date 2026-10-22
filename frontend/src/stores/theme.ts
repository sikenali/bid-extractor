import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getTheme as getThemeFromAPI, setTheme as setThemeToAPI } from '@/api/settings';

export type ThemeType = 'parchment' | 'dark' | 'white';

const THEME_KEY = 'theme';
const ACCENT_KEY = 'accent';
const LAYOUT_KEY = 'layout';

/** localStorage 键名单一出处，视图层不得再硬编码 */
export const THEME_STORAGE = { theme: THEME_KEY, accent: ACCENT_KEY, layout: LAYOUT_KEY } as const;

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(rgb: Rgb): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + part(rgb[0]) + part(rgb[1]) + part(rgb[2])).toUpperCase();
}

function relLuminance(rgb: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const lighter = la > lb ? la : lb;
  const darker = la > lb ? lb : la;
  return (lighter + 0.05) / (darker + 0.05);
}

const MIN_CONTRAST_RATIO = 4.5;
const DARK_BACKGROUND = '#17171A';
const DARK_CARD_BACKGROUND = '#232324';
const LIGHT_CARD_BACKGROUND = '#FCFBF8';
const SOFT_TINT_RATIO = 0.12;

const WHITE_RGB: Rgb = [255, 255, 255];
const INK_RGB: Rgb = hexToRgb('#1F1D1A') as Rgb;

function roundRgb(rgb: Rgb): Rgb {
  const clamped = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamped(rgb[0]), clamped(rgb[1]), clamped(rgb[2])];
}

function scaleRgb(rgb: Rgb, factor: number): Rgb {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

/** 按当前约束把颜色等比压暗/提亮，返回「取整后仍满足约束」的颜色（避免取整后掉出达标线） */
function moveUntil(rgb: Rgb, ok: (candidate: Rgb) => boolean, darker: boolean): Rgb {
  const step = (t: number): Rgb =>
    roundRgb(darker ? scaleRgb(rgb, 1 - t) : mixRgb(rgb, WHITE_RGB, t));
  if (ok(step(0))) return step(0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(step(mid))) hi = mid;
    else lo = mid;
  }
  // 通道取整后可能刚好掉出达标线，继续沿同一方向微调
  let t = hi;
  for (let i = 0; i < 40; i++) {
    const candidate = step(Math.min(1, t));
    if (ok(candidate)) return candidate;
    t += 0.01;
  }
  return step(Math.min(1, t));
}

const DARK_PAGE_BG = hexToRgb(DARK_BACKGROUND) as Rgb;
const DARK_CARD_BG = hexToRgb(DARK_CARD_BACKGROUND) as Rgb;
const LIGHT_CARD_BG = hexToRgb(LIGHT_CARD_BACKGROUND) as Rgb;

/** 深色主题强调色需同时满足：对页面底色、对卡片底色、其上墨色文字均 ≥4.5:1 */
function darkAccentOk(rgb: Rgb): boolean {
  return (
    contrastRatio(rgb, DARK_PAGE_BG) >= MIN_CONTRAST_RATIO &&
    contrastRatio(rgb, DARK_CARD_BG) >= MIN_CONTRAST_RATIO &&
    contrastRatio(rgb, INK_RGB) >= MIN_CONTRAST_RATIO
  );
}

/** 强调色上的前景色：按对比度自动选白字或墨色 */
function bestOnColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#FFFFFF';
  return contrastRatio(rgb, WHITE_RGB) >= contrastRatio(rgb, INK_RGB) ? '#FFFFFF' : '#1F1D1A';
}

/**
 * 深色主题下强调色若过暗则向白色提亮，保证对底色 ≥4.5:1 且其上墨色文字 ≥4.5:1。
 * 例如「黛墨 #2F3640」在 #17171A 上仅 1.47:1，会被提亮到 #8E9297。
 */
function brightenForDark(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  if (darkAccentOk(rgb)) return hex;
  return rgbToHex(moveUntil(rgb, darkAccentOk, false));
}

/**
 * 浅色主题下的表面色：白字与墨字都够不着 4.5:1 时（死区，如玉绿 #3E8C6E）
 * 压暗到白字刚好达标，避免按钮文字不可读。
 */
function deriveSurfaceLight(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  if (contrastRatio(rgb, WHITE_RGB) >= MIN_CONTRAST_RATIO) return hex;
  if (contrastRatio(rgb, INK_RGB) >= MIN_CONTRAST_RATIO) return hex;
  return rgbToHex(moveUntil(rgb, (c) => contrastRatio(c, WHITE_RGB) >= MIN_CONTRAST_RATIO, true));
}

/**
 * 浅色主题下的文字色：强调色当文字用时（标签、选中态、图标）必须对浅色底 ≥4.5:1，
 * 过亮的强调色（鎏金）需压暗成同色系的深色变体。
 */
function deriveTextLight(surface: string): string {
  const rgb = hexToRgb(surface);
  if (!rgb) return surface;
  const tint = roundRgb(mixRgb(rgb, WHITE_RGB, 1 - SOFT_TINT_RATIO));
  const ok = (c: Rgb) =>
    contrastRatio(c, tint) >= MIN_CONTRAST_RATIO &&
    contrastRatio(c, LIGHT_CARD_BG) >= MIN_CONTRAST_RATIO;
  if (ok(rgb)) return surface;
  return rgbToHex(moveUntil(rgb, ok, true));
}

/** 按当前主题派生实际生效的表面色（存留值非合法 hex 时视为未设置） */
function deriveAccent(hex: string | null, theme: ThemeType): string | null {
  if (!hex || !hexToRgb(hex)) return null;
  return theme === 'dark' ? brightenForDark(hex) : deriveSurfaceLight(hex);
}

/**
 * 按当前主题派生强调色的文字安全色：
 * 浅色主题压暗成同色系深色；深色主题提亮，覆盖「压在浅色软底（12% 混色）上」的场景。
 */
function deriveAccentText(surface: string, theme: ThemeType): string {
  if (theme === 'dark') {
    const rgb = hexToRgb(surface);
    if (!rgb) return surface;
    const tint = roundRgb(mixRgb(rgb, DARK_CARD_BG, 1 - SOFT_TINT_RATIO));
    const ok = (c: Rgb) => contrastRatio(c, tint) >= MIN_CONTRAST_RATIO;
    if (ok(rgb)) return surface;
    return rgbToHex(moveUntil(rgb, ok, false));
  }
  return deriveTextLight(surface);
}

/** 由强调色派生浅色底（按钮 hover 等），基于 --color-bg-white 保证深浅主题都协调 */
function primarySoft(accent: string): string {
  return `color-mix(in srgb, ${accent} 12%, var(--color-bg-white))`;
}

/** 主题默认强调色在当前主题下的实际生效色（设置页色盘预览用） */
export function resolveAccentSurface(hex: string, theme: ThemeType): string {
  return deriveAccent(hex, theme) ?? hex;
}

/** 强调色作为文字时的安全色（设置页色盘预览用） */
export function resolveAccentText(hex: string, theme: ThemeType): string {
  return deriveAccentText(resolveAccentSurface(hex, theme), theme);
}

/** 强调色上的前景色（设置页色盘预览用） */
export function resolveAccentForeground(hex: string, theme: ThemeType): string {
  return bestOnColor(resolveAccentSurface(hex, theme));
}

// 主题默认强调色同样按对比度派生（深色主题的 #E05050 提亮后才达标）
const DEFAULT_ACCENT = { parchment: '#C0392B', white: '#C0392B', dark: '#E05050' } as const;
const DARK_PRIMARY = brightenForDark(DEFAULT_ACCENT.dark);

const themeTokens: Record<ThemeType, Record<string, string>> = {
  parchment: {
    '--color-primary': '#C0392B',
    '--color-primary-deep': '#3A5C96',
    '--color-primary-soft': '#FBE9E7',
    '--color-primary-text': deriveTextLight(DEFAULT_ACCENT.parchment),
    '--color-on-primary': '#FFFFFF',
    '--color-bg-main': '#FAF7F2',
    '--color-bg-secondary': '#F7F3EA',
    '--color-bg-card': '#FCFBF8',
    '--color-bg-white': '#FFFFFF',
    '--color-text-primary': '#1F1D1A',
    '--color-text-body': '#3A3A3A',
    '--color-text-secondary': '#6E6A60',
    '--color-text-muted': '#8A8578',
    '--color-text-faint': '#A7A296',
    '--color-border': '#E5DFD3',
    '--color-border-soft': '#EDE9E0',
    '--color-border-hover': '#D9D2C2',
    '--color-success': '#4E9B7A',
    '--color-success-strong': '#3E8A6B',
    '--color-success-soft': '#E4F0EA',
    '--color-info': '#4A72A8',
    '--color-info-soft': '#E8F0F8',
    '--color-warning': '#F39C12',
    '--color-warning-soft': '#FEF5E7',
    '--color-error': '#E74C3C',
    '--color-error-soft': '#FADCDA',
  },
  dark: {
    '--color-primary': DARK_PRIMARY,
    '--color-primary-deep': '#82AEDD',
    '--color-primary-soft': '#3A2323',
    '--color-primary-text': deriveAccentText(DARK_PRIMARY, 'dark'),
    '--color-on-primary': bestOnColor(DARK_PRIMARY),
    '--color-bg-main': '#17171A',
    '--color-bg-secondary': '#1C1C1F',
    '--color-bg-card': '#232324',
    '--color-bg-white': '#232324',
    '--color-text-primary': '#F2F3F5',
    '--color-text-body': '#DDE0E6',
    '--color-text-secondary': '#C9CDD4',
    '--color-text-muted': '#A7AEB9',
    '--color-text-faint': '#86909C',
    '--color-border': '#2A2B2E',
    '--color-border-soft': '#2A2B2E',
    '--color-border-hover': '#3A3B3F',
    '--color-success': '#5CB98C',
    '--color-success-strong': '#7BC8A4',
    '--color-success-soft': '#1A3A2A',
    '--color-info': '#82AEDD',
    '--color-info-soft': '#1A2A3A',
    '--color-warning': '#F2B23E',
    '--color-warning-soft': '#3A2A1A',
    '--color-error': '#E86A5A',
    '--color-error-soft': '#3A1A1A',
  },
  white: {
    '--color-primary': '#C0392B',
    '--color-primary-deep': '#3A5C96',
    '--color-primary-soft': '#FBE9E7',
    '--color-primary-text': deriveTextLight(DEFAULT_ACCENT.white),
    '--color-on-primary': '#FFFFFF',
    '--color-bg-main': '#FAFAFA',
    '--color-bg-secondary': '#F5F5F5',
    '--color-bg-card': '#FFFFFF',
    '--color-bg-white': '#FFFFFF',
    '--color-text-primary': '#1A1A1A',
    '--color-text-body': '#3A3A3A',
    '--color-text-secondary': '#666666',
    '--color-text-muted': '#8A8578',
    '--color-text-faint': '#A7A296',
    '--color-border': '#E0E0E0',
    '--color-border-soft': '#E0E0E0',
    '--color-border-hover': '#D9D2C2',
    '--color-success': '#4E9B7A',
    '--color-success-strong': '#3E8A6B',
    '--color-success-soft': '#E4F0EA',
    '--color-info': '#4A72A8',
    '--color-info-soft': '#E8F0F8',
    '--color-warning': '#F39C12',
    '--color-warning-soft': '#FEF5E7',
    '--color-error': '#E74C3C',
    '--color-error-soft': '#FADCDA',
  },
};

function applyAccentTokens(root: HTMLElement, accent: string | null, theme: ThemeType) {
  // 无自定义强调色时保留主题自身的主色 token（applyTheme 刚写入的行内值），
  // 不能 removeProperty —— 那会让深色主题回落到 global.css 的羊皮纸色。
  if (!accent) return;
  root.style.setProperty('--color-primary', accent);
  root.style.setProperty('--color-primary-soft', primarySoft(accent));
  root.style.setProperty('--color-primary-text', deriveAccentText(accent, theme));
  root.style.setProperty('--color-on-primary', bestOnColor(accent));
}

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeType>('parchment');
  const currentAccent = ref<string | null>(null);
  const layout = ref<'topbar' | 'sidebar'>(
    (localStorage.getItem(LAYOUT_KEY) as 'topbar' | 'sidebar') || 'topbar'
  );

  function setLayout(value: 'topbar' | 'sidebar') {
    layout.value = value;
    localStorage.setItem(LAYOUT_KEY, value);
  }

  function applyAccent(color: string | null) {
    const valid = color && hexToRgb(color) ? color : null;
    if (valid) localStorage.setItem(ACCENT_KEY, valid);
    else localStorage.removeItem(ACCENT_KEY);
    currentAccent.value = valid;
    // 重新按当前主题派生强调色（深色下需提亮以满足对比度）
    applyTheme(currentTheme.value);
  }

  async function loadTheme() {
    try {
      const res = await getThemeFromAPI();
      const saved = res.type as ThemeType | null;
      if (saved && themeTokens[saved]) {
        currentTheme.value = saved;
        applyTheme(saved);
        localStorage.setItem(THEME_KEY, saved);
        return;
      }
    } catch {
      // API unavailable, fall through to localStorage
    }
    const saved = localStorage.getItem(THEME_KEY) as ThemeType | null;
    if (saved && themeTokens[saved]) {
      currentTheme.value = saved;
      applyTheme(saved);
    } else {
      applyTheme(currentTheme.value);
    }
  }

  function applyTheme(theme: ThemeType) {
    const root = document.documentElement;
    const tokens = themeTokens[theme];
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
    // 强调色覆盖主题默认 primary（持久化，切换主题不丢失）；按主题派生以满足对比度
    const accent = localStorage.getItem(ACCENT_KEY);
    applyAccentTokens(root, deriveAccent(accent, theme), theme);
    currentAccent.value = accent;
  }

  function applySavedTheme() {
    const saved = localStorage.getItem(THEME_KEY) as ThemeType | null;
    currentTheme.value = saved && themeTokens[saved] ? saved : currentTheme.value;
    applyTheme(currentTheme.value);
  }

  async function setTheme(theme: ThemeType) {
    currentTheme.value = theme;
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    try {
      await setThemeToAPI(theme);
    } catch {
      // Backend is optional, localStorage is the primary persistence
    }
  }

  return { currentTheme, currentAccent, layout, setLayout, loadTheme, applySavedTheme, setTheme, applyAccent };
});
