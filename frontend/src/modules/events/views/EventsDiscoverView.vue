<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import EventTicketCard from '../components/EventTicketCard.vue'
import { useEvents } from '../composables/useEvents'
import { useEventActions } from '../composables/useEventActions'

const router = useRouter()
const { filters, events, loading, hasMore, load, applyFilters, loadMore } = useEvents()
const actions = useEventActions()

onMounted(() => {
  void load()
})

async function onSubscribe(id: string) {
  await actions.subscribe(id)
  await applyFilters()
}
async function onLeave(id: string) {
  await actions.leave(id)
  await applyFilters()
}
async function onConfirm(id: string) {
  await actions.confirm(id)
  await applyFilters()
}
function viewParticipants(id: string) {
  router.push(`/roles/${id}`)
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="events-discover-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-5xl mx-auto px-4 flex items-center justify-between gap-3">
        <h1 class="text-xl font-bold text-slate-100">Rolês</h1>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-testid="my-events-cta"
            @click="router.push('/meus-roles')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#252640] text-slate-300 hover:bg-[#252640] transition-colors"
          >
            Meus Rolês
          </button>
          <button
            type="button"
            data-testid="create-event-cta"
            @click="router.push('/roles/novo')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] transition-colors"
          >
            + Novo Rolê
          </button>
        </div>
      </div>
    </header>

    <div class="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <!-- Filters -->
      <section
        class="bg-[#1e2038] rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
        data-testid="event-filters"
      >
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-300">Quando</span>
          <select
            v-model="filters.date"
            data-testid="filter-date"
            @change="applyFilters"
            class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="all">Todos</option>
            <option value="7d">Próximos 7 dias</option>
            <option value="30d">Próximos 30 dias</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-300">Tipo</span>
          <select
            v-model="filters.type"
            data-testid="filter-type"
            @change="applyFilters"
            class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="all">Todos</option>
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-slate-300">Cidade</span>
          <input
            v-model="filters.cidade"
            data-testid="filter-cidade"
            placeholder="Ex: São Paulo"
            @keydown.enter.prevent="applyFilters"
            class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </label>
      </section>

      <!-- List -->
      <section class="space-y-4" data-testid="events-list">
        <p v-if="loading && events.length === 0" class="text-slate-400 text-sm">Carregando…</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EventTicketCard
            v-for="event in events"
            :key="event.id"
            :event="event"
            :host-name="event.hostName"
            :cidade="event.cidade ?? undefined"
            @subscribe="onSubscribe"
            @leave="onLeave"
            @confirm="onConfirm"
            @view-participants="viewParticipants"
          />
        </div>

        <div v-if="!loading && events.length === 0" class="text-center py-12 space-y-2">
          <p class="text-slate-400 text-lg">Nenhum Rolê encontrado</p>
          <p class="text-slate-500 text-sm">Que tal criar o primeiro?</p>
        </div>

        <button
          v-if="hasMore"
          type="button"
          data-testid="load-more"
          :disabled="loading"
          @click="loadMore"
          class="w-full py-2 rounded-lg text-sm font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 transition-colors disabled:opacity-50"
        >
          {{ loading ? 'Carregando…' : 'Carregar mais' }}
        </button>
      </section>
    </div>
  </div>
</template>
