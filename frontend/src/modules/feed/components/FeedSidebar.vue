<!-- src/modules/feed/components/FeedSidebar.vue -->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Users, Library } from 'lucide-vue-next'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useCollectionsStore } from '@/modules/collections/composables/useCollections'

const router = useRouter()
const friends = useFriends()
const collections = useCollectionsStore()

const onlineFriends = computed(() =>
  friends.friends.filter(f => f.isOnline).slice(0, 5)
)

const topCollections = computed(() =>
  collections.collections.slice(0, 3)
)

onMounted(async () => {
  if (!friends.friends.length) await friends.fetchAll()
  if (!collections.collections.length) await collections.fetchCollections()
})
</script>

<template>
  <aside class="w-[200px] flex-shrink-0 space-y-4 self-start sticky top-4">
    <!-- Amigos Online -->
    <div class="bg-[#1e2038] rounded-2xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amigos Online</h3>
        <Users :size="14" class="text-slate-500" />
      </div>

      <div v-if="onlineFriends.length === 0" class="text-xs text-slate-500 text-center py-2">
        Nenhum amigo online
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="friend in onlineFriends"
          :key="friend.id"
          class="flex items-center gap-2 cursor-pointer group"
          @click="router.push(`/profile/${friend.id}`)"
        >
          <div class="relative flex-shrink-0">
            <img
              v-if="friend.avatarUrl"
              :src="friend.avatarUrl"
              :alt="friend.displayName"
              class="w-7 h-7 rounded-full object-cover"
            />
            <div
              v-else
              class="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-300"
            >
              {{ friend.displayName.charAt(0).toUpperCase() }}
            </div>
            <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[#1e2038] rounded-full" />
          </div>
          <span class="text-xs text-slate-300 group-hover:text-amber-400 transition-colors truncate">
            {{ friend.displayName }}
          </span>
        </li>
      </ul>

      <button
        @click="router.push('/friends')"
        class="mt-3 text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        Ver todos →
      </button>
    </div>

    <!-- Suas Coleções -->
    <div class="bg-[#1e2038] rounded-2xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Coleções</h3>
        <Library :size="14" class="text-slate-500" />
      </div>

      <div v-if="topCollections.length === 0" class="text-xs text-slate-500 text-center py-2">
        Nenhuma coleção ainda
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="col in topCollections"
          :key="col.id"
          class="flex items-center gap-2 cursor-pointer group"
          @click="router.push(`/collections/${col.id}`)"
        >
          <span class="text-base flex-shrink-0">{{ col.iconUrl ?? '📦' }}</span>
          <div class="min-w-0">
            <p class="text-xs text-slate-300 group-hover:text-amber-400 transition-colors truncate">{{ col.name }}</p>
            <p class="text-xs text-slate-500">{{ col.itemCount ?? 0 }} itens</p>
          </div>
        </li>
      </ul>

      <button
        @click="router.push('/collections')"
        class="mt-3 text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        Ver todas →
      </button>
    </div>
  </aside>
</template>
