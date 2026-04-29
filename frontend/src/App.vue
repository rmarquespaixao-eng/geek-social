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
    <SteamImportBanner v-if="store.isAuthenticated" />
    <FloatingChatBar v-if="store.isAuthenticated" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/shared/auth/authStore'
import AppSidebar from '@/shared/ui/AppSidebar.vue'
import IncomingCallModal from '@/modules/chat/components/IncomingCallModal.vue'
import CallScreen from '@/modules/chat/components/CallScreen.vue'
import FloatingChatBar from '@/modules/chat/components/FloatingChatBar.vue'
import SteamImportBanner from '@/modules/integrations/steam/components/SteamImportBanner.vue'
import { useFloatingChats } from '@/modules/chat/composables/useFloatingChats'

// Inicializa cedo para que o watcher em chat.activeConversationId capture
// qualquer ativação de conversa desde o boot (incluindo /chat/:id direto).
useFloatingChats()

const route = useRoute()
const store = useAuthStore()

const publicRoutes = ['/login', '/register', '/forgot-password']
const fullHeightRoutes = ['/chat']

const showSidebar = computed(() =>
  store.isAuthenticated && !publicRoutes.some((r) => route.path.startsWith(r))
)

const isFullHeight = computed(() =>
  fullHeightRoutes.some((r) => route.path.startsWith(r))
)
</script>
