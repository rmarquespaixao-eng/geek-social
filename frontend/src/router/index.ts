import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/shared/auth/authStore'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/feed',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/modules/auth/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/modules/auth/views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/modules/auth/views/ForgotPasswordView.vue'),
      meta: { public: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/modules/auth/views/AuthCallbackView.vue'),
      meta: { public: true },
    },
    {
      path: '/feed',
      name: 'feed',
      component: () => import('@/modules/feed/views/FeedView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/modules/auth/views/SearchView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/:userId',
      name: 'profile',
      component: () => import('@/modules/auth/views/ProfileView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/modules/auth/views/SettingsView.vue'),
    },
    {
      path: '/friends',
      name: 'friends',
      component: () => import('@/modules/friends/views/FriendsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections',
      name: 'Collections',
      component: () => import('@/modules/collections/views/CollectionsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections/:id',
      name: 'CollectionDetail',
      component: () => import('@/modules/collections/views/CollectionDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections/:id/items/new',
      name: 'ItemNew',
      component: () => import('@/modules/collections/views/ItemFormView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections/:id/items/:itemId',
      name: 'ItemDetail',
      component: () => import('@/modules/collections/views/ItemDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collections/:id/items/:itemId/edit',
      name: 'ItemEdit',
      component: () => import('@/modules/collections/views/ItemFormView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/modules/chat/views/ChatView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:conversationId',
      name: 'chat-conversation',
      component: () => import('@/modules/chat/views/ChatView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/modules/notifications/views/NotificationsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/integrations/steam/import',
      name: 'steam-import',
      component: () => import('@/modules/integrations/steam/views/SteamImportView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/vitrine',
      name: 'vitrine',
      component: () => import('@/modules/offers/views/VitrineView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/roles',
      name: 'events-discover',
      component: () => import('@/modules/events/views/EventsDiscoverView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/roles/novo',
      name: 'event-create',
      component: () => import('@/modules/events/views/EventCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/roles/:id',
      name: 'event-detail',
      component: () => import('@/modules/events/views/EventDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/roles/:id/editar',
      name: 'event-edit',
      component: () => import('@/modules/events/views/EventEditView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/meus-roles',
      name: 'my-events',
      component: () => import('@/modules/events/views/MyEventsView.vue'),
      meta: { requiresAuth: true },
    },
    // ── Communities ──────────────────────────────────────────────────────────
    {
      path: '/comunidades',
      name: 'community-discover',
      component: () => import('@/modules/communities/views/CommunityDiscoverView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/comunidades/nova',
      name: 'community-create',
      component: () => import('@/modules/communities/views/CommunityCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/comunidades/:slug',
      name: 'community-detail',
      component: () => import('@/modules/communities/views/CommunityDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/comunidades/:slug/editar',
      name: 'community-edit',
      component: () => import('@/modules/communities/views/CommunityEditView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/comunidades/:slug/topicos/:topicId',
      name: 'community-topic',
      component: () => import('@/modules/communities/views/CommunityTopicView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/minhas-comunidades',
      name: 'my-communities',
      component: () => import('@/modules/communities/views/MyCommunitiesView.vue'),
      meta: { requiresAuth: true },
    },
    // ─────────────────────────────────────────────────────────────────────────
    {
      path: '/marketplace',
      redirect: '/vitrine',
    },
    {
      path: '/trades',
      redirect: '/vitrine',
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/feed',
    },
  ],
})

router.beforeEach((to) => {
  const store = useAuthStore()
  if (!to.meta.public && !store.isAuthenticated) {
    return { name: 'login' }
  }
  if (to.meta.public && store.isAuthenticated && to.name !== 'auth-callback') {
    return { name: 'feed' }
  }
})

export default router
