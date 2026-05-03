import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
        { path: 'users', name: 'users', component: () => import('@/pages/UsersPage.vue') },
        { path: 'communities', name: 'communities', component: () => import('@/pages/CommunitiesPage.vue') },
        { path: 'collections', name: 'collections', component: () => import('@/pages/CollectionsPage.vue') },
        { path: 'reports', name: 'reports', component: () => import('@/pages/ReportsPage.vue') },
        { path: 'logs', name: 'logs', component: () => import('@/pages/LogsPage.vue') },
        { path: 'feature-flags', name: 'feature-flags', component: () => import('@/pages/FeatureFlagsPage.vue') },
        { path: 'lgpd', name: 'lgpd', component: () => import('@/pages/LgpdPage.vue') },
        { path: 'moderation', name: 'moderation', component: () => import('@/pages/ModerationPage.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (auth.isAuthenticated && !auth.user) {
    await auth.fetchMe()
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
