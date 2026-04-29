<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import CommunityCard from '../components/CommunityCard.vue'
import { useCommunitiesStore } from '../stores/communitiesStore'

type Tab = 'owned' | 'joined'

const router = useRouter()
const store = useCommunitiesStore()
const tab = ref<Tab>('joined')

const communities = computed(() =>
  tab.value === 'owned' ? store.ownedCommunities : store.joinedCommunities,
)

const loading = computed(() =>
  tab.value === 'owned' ? store.ownedLoading : store.joinedLoading,
)

async function ensureLoaded() {
  await store.fetchList(tab.value === 'owned' ? 'owned' : 'joined')
}

onMounted(() => {
  void ensureLoaded()
})

async function switchTab(t: Tab) {
  tab.value = t
  await ensureLoaded()
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="my-communities-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-5xl mx-auto px-4 flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-100">Minhas Comunidades</h1>
        <button
          type="button"
          @click="router.push('/comunidades/nova')"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] transition-colors"
        >
          + Nova comunidade
        </button>
      </div>
    </header>

    <div class="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <!-- Tabs -->
      <nav class="flex gap-2" role="tablist" data-testid="my-communities-tabs">
        <button
          type="button"
          role="tab"
          data-testid="tab-joined"
          :aria-selected="tab === 'joined'"
          @click="switchTab('joined')"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            tab === 'joined'
              ? 'bg-amber-500 text-[#0f0f1a]'
              : 'bg-slate-700/40 text-slate-300 hover:bg-slate-700/60',
          ]"
        >
          Participando
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-owned"
          :aria-selected="tab === 'owned'"
          @click="switchTab('owned')"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            tab === 'owned'
              ? 'bg-amber-500 text-[#0f0f1a]'
              : 'bg-slate-700/40 text-slate-300 hover:bg-slate-700/60',
          ]"
        >
          Criadas por mim
        </button>
      </nav>

      <section>
        <p v-if="loading && communities.length === 0" class="text-slate-400 text-sm">
          Carregando…
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CommunityCard
            v-for="community in communities"
            :key="community.id"
            :community="community"
          />
        </div>

        <p
          v-if="!loading && communities.length === 0"
          class="text-slate-500 text-sm text-center py-8"
        >
          {{
            tab === 'owned'
              ? 'Você ainda não criou nenhuma comunidade.'
              : 'Você ainda não participa de nenhuma comunidade.'
          }}
        </p>
      </section>
    </div>
  </div>
</template>
