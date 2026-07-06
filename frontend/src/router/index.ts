import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/upload' },
    {
      path: '/upload',
      name: 'Upload',
      component: () => import('@/views/UploadView.vue')
    },
    {
      path: '/project/:id?',
      name: 'Project',
      component: () => import('@/views/ProjectView.vue')
    },
    { path: '/settings', redirect: '/settings/theme' },
    {
      path: '/settings/theme',
      name: 'ThemeSettings',
      component: () => import('@/views/settings/ThemeSettingsView.vue')
    },
    {
      path: '/settings/template',
      name: 'TemplateSettings',
      component: () => import('@/views/settings/TemplateSettingsView.vue')
    },
    {
      path: '/settings/rules',
      name: 'RulesSettings',
      component: () => import('@/views/settings/RulesSettingsView.vue')
    },
    {
      path: '/settings/export',
      name: 'ExportSettings',
      component: () => import('@/views/settings/ExportSettingsView.vue')
    },
    {
      path: '/settings/apikey',
      name: 'ApiSettings',
      component: () => import('@/views/settings/ApiKeySettingsView.vue')
    }
  ]
});

export default router;
