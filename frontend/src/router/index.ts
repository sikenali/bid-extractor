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
      path: '/project',
      name: 'Project',
      component: () => import('@/views/ProjectView.vue')
    },
    {
      path: '/settings',
      component: () => import('@/components/layout/SettingsLayout.vue'),
      children: [
        { path: '', redirect: '/settings/theme' },
        {
          path: 'theme',
          name: 'ThemeSettings',
          component: () => import('@/views/settings/ThemeSettingsView.vue')
        },
        {
          path: 'skill',
          name: 'SkillSettings',
          component: () => import('@/views/settings/SkillSettingsView.vue')
        },
        {
          path: 'rules',
          name: 'RulesSettings',
          component: () => import('@/views/settings/RulesSettingsView.vue')
        },
        {
          path: 'export',
          name: 'ExportSettings',
          component: () => import('@/views/settings/ExportSettingsView.vue')
        },
        {
          path: 'apikey',
          name: 'ApiSettings',
          component: () => import('@/views/settings/ApiKeySettingsView.vue')
        }
      ]
    }
  ]
});

export default router;