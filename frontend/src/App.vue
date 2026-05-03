<template>
  <div class="flex h-screen overflow-hidden bg-(--color-bg-base)">
    <!-- Sidebar: oculta nas rotas públicas -->
    <AppSidebar v-if="showSidebar" />

    <!-- Conteúdo principal -->
    <main
      class="flex-1 min-h-0"
      :class="isFullHeight ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'"
    >
      <RouterView />
    </main>

    <!-- Globais de chamada (sobre qualquer rota) -->
    <IncomingCallModal />
    <CallScreen />
    <SteamImportBanner v-if="store.isAuthenticated && featureFlagsStore.isEnabled('steam_integration')" />
    <FloatingChatBar v-if="store.isAuthenticated && featureFlagsStore.isEnabled('module_chat')" />

  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/shared/auth/authStore'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'
import AppSidebar from '@/shared/ui/AppSidebar.vue'
import IncomingCallModal from '@/modules/chat/components/IncomingCallModal.vue'
import CallScreen from '@/modules/chat/components/CallScreen.vue'
import FloatingChatBar from '@/modules/chat/components/FloatingChatBar.vue'
import SteamImportBanner from '@/modules/integrations/steam/components/SteamImportBanner.vue'
import { useFloatingChats } from '@/modules/chat/composables/useFloatingChats'
// Inicializa cedo para que o watcher em chat.activeConversationId capture
// qualquer ativação de conversa desde o boot (incluindo /chat/:id direto).
useFloatingChats()

const MODULE_FLAG_MAP: Record<string, string> = {
  '/feed': 'module_feed',
  '/comunidades': 'module_communities',
  '/collections': 'module_collections',
  '/vitrine': 'module_marketplace',
  '/roles': 'module_roles',
  '/friends': 'module_friends',
  '/chat': 'module_chat',
  '/notifications': 'module_notifications',
}

const route = useRoute()
const router = useRouter()
const store = useAuthStore()
const featureFlagsStore = useFeatureFlagsStore()

featureFlagsStore.load().then(() => featureFlagsStore.startPolling())
onUnmounted(() => featureFlagsStore.stopPolling())

// Redireciona quando flags carregam/mudam e o usuário está em módulo desabilitado.
watchEffect(() => {
  if (!featureFlagsStore.loaded || !store.isAuthenticated) return
  const basePath = '/' + route.path.split('/')[1]
  const flagKey = MODULE_FLAG_MAP[basePath]
  if (!flagKey || featureFlagsStore.isEnabled(flagKey)) return
  const first = Object.entries(MODULE_FLAG_MAP).find(
    ([p, k]) => featureFlagsStore.isEnabled(k) && !p.includes('/', 1),
  )
  if (first) router.replace(first[0])
})

const publicRoutes = ['/login', '/register', '/forgot-password']
const fullHeightRoutes = ['/chat']

const showSidebar = computed(() =>
  store.isAuthenticated && !publicRoutes.some((r) => route.path.startsWith(r))
)

const isFullHeight = computed(() =>
  fullHeightRoutes.some((r) => route.path.startsWith(r))
)
</script>
