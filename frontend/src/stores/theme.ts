import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type ThemeType = 'parchment' | 'dark' | 'white';

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeType>('parchment');

  function loadTheme() {
    const saved = localStorage.getItem('theme') as ThemeType | null;
    if (saved) {
      currentTheme.value = saved;
      applyTheme(saved);
    }
  }

  function applyTheme(theme: ThemeType) {
    document.body.className = `theme-${theme}`;
    if (theme === 'dark') {
      document.body.style.backgroundColor = '#1A1A2E';
      document.body.style.color = '#E0E0E0';
    } else if (theme === 'white') {
      document.body.style.backgroundColor = '#FFFFFF';
      document.body.style.color = '#1A1A1A';
    } else {
      document.body.style.backgroundColor = '';
      document.body.style.color = '';
    }
  }

  function setTheme(theme: ThemeType) {
    currentTheme.value = theme;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }

  watch(currentTheme, (theme) => {
    applyTheme(theme);
  });

  return { currentTheme, loadTheme, setTheme };
});
