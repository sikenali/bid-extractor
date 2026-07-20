import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getTheme as getThemeFromAPI, setTheme as setThemeToAPI } from '@/api/settings';

export type ThemeType = 'parchment' | 'dark' | 'white';

const themeTokens: Record<ThemeType, Record<string, string>> = {
  parchment: {
    '--color-primary': '#C43D3D',
    '--color-bg-main': '#FBF7F0',
    '--color-bg-secondary': '#F5EFE3',
    '--color-bg-card': '#F5E8D8',
    '--color-bg-white': '#FFFFFF',
    '--color-text-primary': '#3D2B1F',
    '--color-text-secondary': '#8B7355',
    '--color-text-muted': '#9B8C7C',
    '--color-border': '#D4C5A9',
  },
  dark: {
    '--color-primary': '#E05050',
    '--color-bg-main': '#1A1A2E',
    '--color-bg-secondary': '#16213E',
    '--color-bg-card': '#2A2A4A',
    '--color-bg-white': '#1E1E38',
    '--color-text-primary': '#E0E0E0',
    '--color-text-secondary': '#A0A0B0',
    '--color-text-muted': '#707080',
    '--color-border': '#3A3A5A',
  },
  white: {
    '--color-primary': '#C43D3D',
    '--color-bg-main': '#FFFFFF',
    '--color-bg-secondary': '#FAFAFA',
    '--color-bg-card': '#F5F5F5',
    '--color-bg-white': '#FFFFFF',
    '--color-text-primary': '#1A1A1A',
    '--color-text-secondary': '#666666',
    '--color-text-muted': '#999999',
    '--color-border': '#E0E0E0',
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