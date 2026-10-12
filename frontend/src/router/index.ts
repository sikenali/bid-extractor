import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/', 
      component: () => import('@/components/layout/AppLayout.vue'),
      children: [
        { path: '', redirect: '/upload' },
        { path: 'upload', component: () => import('@/views/UploadView.vue') },
        { path: 'project', component: () => import('@/views/ProjectView.vue') },
        {
          path: 'settings',
          component: () => import('@/components/layout/SettingsLayout.vue'),
          children: [
            { path: '', redirect: '/settings/theme' },
            { path: 'theme', component: () => import('@/views/settings/ThemeSettingsView.vue') },
            { path: 'rules', component: () => import('@/views/settings/RulesSettingsView.vue') },
            { path: 'export', component: () => import('@/views/settings/ExportSettingsView.vue') },
            { path: 'about', component: () => import('@/views/settings/AboutSettingsView.vue') },
          ]
        }
      ]
    },
  ]
});

export default router;

