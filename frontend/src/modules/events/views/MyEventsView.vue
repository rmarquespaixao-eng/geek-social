<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import EventTicketCard from '../components/EventTicketCard.vue'
import { useEventsStore } from '../stores/eventsStore'

type Tab = 'attending' | 'hosted'

const router = useRouter()
const store = useEventsStore()
const tab = ref<Tab>('attending')

const events = computed(() =>
  tab.value === 'attending' ? store.attendingEvents : store.hostedEvents,
)
const loading = computed(() =>
  tab.value === 'attending' ? store.attendingLoading : store.hostedLoading,
)

async function ensureLoaded() {
  if (tab.value === 'attending') await store.fetchAttending()
  else await store.fetchHosted()
}

onMounted(() => {
  void ensureLoaded()
})

async function switchTab(t: Tab) {
  tab.value = t
  await ensureLoaded()
}
function viewParticipants(id: string) {
  router.push(`/roles/${id}`)
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="my-events-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-5xl mx-auto px-4">
        <h1 class="text-xl font-bold text-slate-100">Meus Rolês</h1>
      </div>
    </header>

    <div class="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <!-- Tabs -->
      <nav class="flex gap-2" data-testid="my-events-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="tab-attending"
          :aria-selected="tab === 'attending'"
          @click="switchTab('attending')"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            tab === 'attending'
              ? 'bg-amber-500 text-[#0f0f1a]'
              : 'bg-slate-700/40 text-slate-300 hover:bg-slate-700/60',
          ]"
        >
          Inscritos
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-hosted"
          :aria-selected="tab === 'hosted'"
          @click="switchTab('hosted')"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            tab === 'hosted'
              ? 'bg-amber-500 text-[#0f0f1a]'
              : 'bg-slate-700/40 text-slate-300 hover:bg-slate-700/60',
          ]"
        >
          Anfitrião
        </button>
      </nav>

      <section class="space-y-4">
        <p v-if="loading && events.length === 0" class="text-slate-400 text-sm">Carregando…</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EventTicketCard
            v-for="event in events"
            :key="event.id"
            :event="event"
            :host-name="event.hostName"
            :cidade="event.cidade ?? undefined"
            @view-participants="viewParticipants"
          />
        </div>

        <p
          v-if="!loading && events.length === 0"
          class="text-slate-500 text-sm text-center py-8"
        >
          {{ tab === 'attending' ? 'Você não está inscrito em nenhum Rolê.' : 'Você não criou nenhum Rolê.' }}
        </p>
      </section>
    </div>
  </div>
</template>
