<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Bell } from 'lucide-vue-next'

const route = useRoute()

const titles: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'Usuários',
  communities: 'Comunidades',
  collections: 'Coleções',
  reports: 'Denúncias',
  logs: 'Logs de Atividade',
  'feature-flags': 'Feature Flags',
  lgpd: 'LGPD',
  moderation: 'Moderação',
}

const title = () => titles[route.name as string] || 'Admin'
</script>

<template>
  <header class="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
    <h1 class="text-lg font-semibold text-slate-900">{{ title() }}</h1>
    <div class="flex items-center gap-3">
      <button class="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
        <Bell class="h-5 w-5" />
      </button>
    </div>
  </header>
</template>
