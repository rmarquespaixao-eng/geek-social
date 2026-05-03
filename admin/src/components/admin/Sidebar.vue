<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import {
  LayoutDashboard, Users, Globe, Layers, Flag,
  Activity, ToggleLeft, ShieldCheck, Shield, LogOut,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const nav = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Usuários', to: '/users', icon: Users },
  { name: 'Comunidades', to: '/communities', icon: Globe },
  { name: 'Coleções', to: '/collections', icon: Layers },
  { name: 'Denúncias', to: '/reports', icon: Flag },
  { name: 'Logs de Atividade', to: '/logs', icon: Activity },
  { name: 'Feature Flags', to: '/feature-flags', icon: ToggleLeft },
  { name: 'LGPD', to: '/lgpd', icon: ShieldCheck },
  { name: 'Moderação', to: '/moderation', icon: Shield },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}

async function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <aside class="flex h-screen w-64 flex-col bg-slate-900 text-white fixed inset-y-0 left-0 z-50">
    <div class="flex h-16 items-center gap-3 border-b border-slate-700/50 px-6">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-sm">G</div>
      <div>
        <p class="text-sm font-semibold text-white">GeekSocial</p>
        <p class="text-xs text-slate-400">Admin Panel</p>
      </div>
    </div>

    <nav class="flex-1 overflow-y-auto py-4 px-3">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        :class="[
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mb-0.5',
          isActive(item.to)
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white',
        ]"
      >
        <component :is="item.icon" class="h-4 w-4 shrink-0" />
        {{ item.name }}
      </RouterLink>
    </nav>

    <div class="border-t border-slate-700/50 p-3">
      <div class="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white uppercase">
          {{ auth.user?.username?.[0] || 'A' }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-white">{{ auth.user?.username || 'Admin' }}</p>
          <p class="truncate text-xs text-slate-400">{{ auth.user?.role }}</p>
        </div>
      </div>
      <button
        @click="logout"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <LogOut class="h-4 w-4" />
        Sair
      </button>
    </div>
  </aside>
</template>
