import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getTheme as getThemeFromAPI, setTheme as setThemeToAPI } from '@/api/settings';

export type ThemeType = 'parchment' | 'dark' | 'white';

const themeTokens: Record<ThemeType, Record<string, string>> = {
  parchment: {
    '--color-primary': '#C0392B',
    '--color-primary-soft': '#FBE9E7',
    '--color-bg-main': '#FAF7F2',
    '--color-bg-secondary': '#F7F3EA',
    '--color-bg-card': '#FCFBF8',
    '--color-bg-white': '#FFFFFF',
    '--color-text-primary': '#1F1D1A',
    '--color-text-secondary': '#6E6A60',
    '--color-text-muted': '#8A8578',
    '--color-border': '#E5DFD3',
    '--color-border-soft': '#EDE9E0',
  },
  dark: {
    '--color-primary': '#E05050',
    '--color-primary-soft': '#3A2323',
    '--color-bg-main': '#1A1A2E',
    '--color-bg-secondary': '#16213E',
    '--color-bg-card': '#2A2A4A',
    '--color-bg-white': '#1E1E38',
    '--color-text-primary': '#E0E0E0',
    '--color-text-secondary': '#A0A0B0',
    '--color-text-muted': '#707080',
    '--color-border': '#3A3A5A',
    '--color-border-soft': '#3A3A5A',
  },
  white: {
    '--color-primary': '#C0392B',
    '--color-primary-soft': '#FBE9E7',
    '--color-bg-main': '#FFFFFF',
    '--color-bg-secondary': '#FAFAFA',
    '--color-bg-card': '#F5F5F5',
    '--color-bg-white': '#FFFFFF',
    '--color-text-primary': '#1A1A1A',
    '--color-text-secondary': '#666666',
    '--color-text-muted': '#999999',
    '--color-border': '#E0E0E0',
    '--color-border-soft': '#E0E0E0',
  },
};

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeType>('parchment');

  async function loadTheme() {
    try {
      const res = await getThemeFromAPI();
      const saved = res.type as ThemeType | null;
      if (saved && themeTokens[saved]) {
        currentTheme.value = saved;
        applyTheme(saved);
        localStorage.setItem('theme', saved);
        return;
      }
    } catch {
      // API unavailable, fall through to localStorage
    }
    const saved = localStorage.getItem('theme') as ThemeType | null;
    if (saved && themeTokens[saved]) {
      currentTheme.value = saved;
      applyTheme(saved);
    }
  }

  function applyTheme(theme: ThemeType) {
    const root = document.documentElement;
    const tokens = themeTokens[theme];
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
  }

  async function setTheme(theme: ThemeType) {
    currentTheme.value = theme;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    try {
      await setThemeToAPI(theme);
    } catch {
      // Backend is optional, localStorage is the primary persistence
    }
  }

  return { currentTheme, loadTheme, setTheme };
});