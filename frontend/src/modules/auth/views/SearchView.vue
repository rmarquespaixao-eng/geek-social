<template>
  <div class="min-h-screen bg-(--color-bg-base)">
    <AppPageHeader :icon="Search" title="Buscar usuários">
      <template #subtitle>
        <span>Encontre pessoas pelo nome de usuário</span>
      </template>
    </AppPageHeader>

    <div class="max-w-2xl mx-auto px-4 py-6 md:px-8">
      <!-- Campo de busca -->
      <div class="relative mb-6">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)" :size="18" />
        <input
          v-model="query"
          type="text"
          placeholder="Digite um nome de usuário..."
          class="w-full bg-(--color-bg-elevated) text-(--color-text-primary) placeholder-[#475569] text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-(--color-accent-amber)/50 transition"
          autofocus
        />
        <button v-if="query" @click="query = ''" class="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-muted) hover:text-(--color-text-primary)">
          <X :size="16" />
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>

      <!-- Sem resultados -->
      <div v-else-if="query.length >= 2 && results.length === 0" class="text-center py-12 text-(--color-text-muted)">
        <UserX class="mx-auto mb-3 h-12 w-12 opacity-40" />
        <p class="text-sm">Nenhum usuário encontrado para "<strong>{{ query }}</strong>"</p>
      </div>

      <!-- Estado inicial -->
      <div v-else-if="query.length < 2 && query.length > 0" class="text-center py-12 text-(--color-text-muted) text-sm">
        Continue digitando...
      </div>

      <!-- Resultados -->
      <div v-else-if="results.length > 0" class="space-y-2">
        <RouterLink
          v-for="user in results"
          :key="user.id"
          :to="`/profile/${user.id}`"
          class="flex items-center gap-3 p-3 rounded-xl bg-(--color-bg-elevated) border border-transparent hover:border-(--color-accent-amber)/30 hover:bg-(--color-bg-surface) transition-all"
        >
          <AppAvatar :src="user.avatarUrl" :name="user.displayName" :size="44" />
          <div>
            <p class="text-sm font-semibold text-(--color-text-primary)">{{ user.displayName }}</p>
            <p class="text-xs text-(--color-text-muted)">@{{ user.displayName.toLowerCase().replace(/\s+/g, '') }}</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, X, UserX } from 'lucide-vue-next'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import { searchUsers } from '../services/usersService'

const query = ref('')
const results = ref<{ id: string; displayName: string; avatarUrl: string | null }[]>([])
const loading = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  results.value = []
  if (val.trim().length < 2) return
  loading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      results.value = await searchUsers(val.trim())
    } finally {
      loading.value = false
    }
  }, 350)
})
</script>
