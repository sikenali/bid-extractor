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
  ],
});

export default router;