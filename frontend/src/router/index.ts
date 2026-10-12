import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/components/layout/MainApp.vue'),
      children: [
        { path: '', redirect: '/upload' },
        { path: 'upload', component: () => import('@/views/UploadView.vue') },
        { path: 'result', component: () => import('@/views/ProjectView.vue') },
        { path: 'project', redirect: (to) => ({ path: '/result', query: to.query }) },
      ],
    },
    {
      path: '/settings',
      component: () => import('@/components/layout/SettingsLayout.vue'),
      children: [
        { path: '', redirect: '/settings/theme' },
        { path: 'theme', component: () => import('@/views/settings/ThemeSettingsView.vue') },
        { path: 'template', component: () => import('@/views/settings/TemplateSettingsView.vue') },
        { path: 'skill', component: () => import('@/views/settings/SkillSettingsView.vue') },
        { path: 'rules', component: () => import('@/views/settings/RulesSettingsView.vue') },
        { path: 'model', component: () => import('@/views/settings/ApiKeySettingsView.vue') },
        { path: 'export', component: () => import('@/views/settings/ExportSettingsView.vue') },
        { path: 'profile', component: () => import('@/views/settings/ProfileSettingsView.vue') },
        { path: 'about', component: () => import('@/views/settings/AboutSettingsView.vue') },
      ],
    },
  ],
});

export default router;