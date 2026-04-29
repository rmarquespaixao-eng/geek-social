<template>
  <aside
    v-if="ui.sidebarMode !== 'hidden'"
    :class="[
      'flex flex-col h-screen sticky top-0 bg-(--color-bg-surface) border-r border-(--color-bg-elevated) transition-all duration-200 flex-shrink-0',
      ui.sidebarMode === 'expanded' ? 'w-[220px]' : 'w-[52px]',
    ]"
  >
    <!-- Logo -->
    <div class="h-16 flex items-center gap-3 px-3 border-b border-(--color-bg-elevated)" :class="ui.sidebarMode === 'expanded' ? 'lg:px-4' : ''">
      <div class="w-8 h-8 rounded-lg bg-(--color-accent-amber) flex items-center justify-center flex-shrink-0">
        <Gamepad2 :size="18" class="text-[#0f0f1a]" />
      </div>
      <span v-if="ui.sidebarMode === 'expanded'" class="font-bold text-(--color-text-primary) text-lg leading-none">Geek Social</span>
    </div>

    <!-- Nav items -->
    <nav class="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ navigate }"
      >
        <button
          @click="navigate"
          :title="ui.sidebarMode === 'collapsed' ? item.label : ''"
          :class="[
            'w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors duration-150 group relative',
            isItemActive(item.to)
              ? 'bg-(--color-accent-amber)/10 text-(--color-accent-amber)'
              : 'text-(--color-text-secondary) hover:bg-(--color-bg-elevated) hover:text-(--color-text-primary)',
          ]"
        >
          <component :is="item.icon" :size="20" class="flex-shrink-0" />
          <span v-if="ui.sidebarMode === 'expanded'" class="text-sm font-medium truncate">{{ item.label }}</span>
          <AppBadge
            v-if="item.badge && item.badge > 0 && ui.sidebarMode === 'expanded'"
            :count="item.badge"
            variant="danger"
            class="ml-auto inline-flex"
          />
          <AppBadge
            v-if="item.badge && item.badge > 0 && ui.sidebarMode === 'collapsed'"
            :count="item.badge"
            variant="danger"
            class="absolute top-1 right-1"
          />
        </button>
      </RouterLink>
    </nav>

    <!-- Rodapé: usuário + toggle -->
    <div class="border-t border-(--color-bg-elevated) p-2">
      <div class="flex items-center gap-1" :class="ui.sidebarMode === 'collapsed' ? 'flex-col' : ''">
        <RouterLink :to="`/profile/${user?.id}`" class="flex-1 min-w-0" :class="ui.sidebarMode === 'collapsed' ? 'w-full' : ''">
          <div class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-(--color-bg-elevated) transition-colors cursor-pointer">
            <AppAvatar
              :src="user?.avatarUrl"
              :name="user?.displayName ?? 'User'"
              :size="32"
              :show-status="true"
            />
            <div v-if="ui.sidebarMode === 'expanded'" class="overflow-hidden">
              <p class="text-sm font-medium text-(--color-text-primary) truncate">{{ user?.displayName }}</p>
              <p class="text-xs text-(--color-status-online)">Online</p>
            </div>
          </div>
        </RouterLink>
        <RouterLink to="/settings" class="flex-shrink-0 p-2 rounded-lg text-(--color-text-muted) hover:bg-(--color-bg-elevated) hover:text-(--color-text-primary) transition-colors" title="Configurações">
          <Settings :size="16" />
        </RouterLink>
      </div>
      <button
        type="button"
        :title="cycleTooltip"
        class="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-(--color-text-muted) hover:bg-(--color-bg-elevated) hover:text-(--color-text-primary) transition-colors text-xs"
        @click="ui.cycleSidebar"
      >
        <component :is="cycleIcon" :size="14" />
        <span v-if="ui.sidebarMode === 'expanded'">Recolher</span>
      </button>
    </div>
  </aside>

  <!-- Botão flutuante pra reabrir quando sidebar está oculto -->
  <button
    v-else
    type="button"
    title="Mostrar menu"
    class="fixed top-3 left-3 z-30 w-10 h-10 rounded-lg bg-(--color-bg-card) border border-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) shadow-lg flex items-center justify-center transition-colors"
    @click="ui.showSidebar"
  >
    <PanelLeftOpen :size="18" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Home, Library, Users, MessageSquare, Bell, Gamepad2, Settings, PanelLeftClose, PanelLeft, PanelLeftOpen, Store, Ticket } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useChat } from '@/modules/chat/composables/useChat'
import { useNotifications } from '@/modules/notifications/composables/useNotifications'
import { useUiPreferences } from './useUiPreferences'
import AppAvatar from './AppAvatar.vue'
import AppBadge from './AppBadge.vue'

const store = useAuthStore()
const user = computed(() => store.user)
const route = useRoute()
const ui = useUiPreferences()

const cycleIcon = computed(() => {
  if (ui.sidebarMode === 'expanded') return PanelLeftClose
  if (ui.sidebarMode === 'collapsed') return PanelLeft
  return PanelLeftOpen
})

const cycleTooltip = computed(() => {
  if (ui.sidebarMode === 'expanded') return 'Recolher (só ícones)'
  if (ui.sidebarMode === 'collapsed') return 'Ocultar menu'
  return 'Mostrar menu'
})

const friendsStore = useFriends()
const chatStore = useChat()
const notificationsStore = useNotifications()

const navItems = computed(() => [
  { to: '/feed', label: 'Feed', icon: Home, badge: 0 },
  { to: '/collections', label: 'Coleções', icon: Library, badge: 0 },
  { to: '/vitrine', label: 'Vitrine', icon: Store, badge: 0 },
  { to: '/roles', label: 'Rolê', icon: Ticket, badge: 0 },
  { to: '/friends', label: 'Amigos', icon: Users, badge: friendsStore.pendingCount },
  { to: '/chat', label: 'Chat', icon: MessageSquare, badge: chatStore.totalUnread },
  { to: '/notifications', label: 'Notificações', icon: Bell, badge: notificationsStore.unreadCount },
])

function isItemActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/')
}
</script>
