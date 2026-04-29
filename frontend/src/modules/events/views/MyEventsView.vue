<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import EventTicketCard from '../components/EventTicketCard.vue'
import { useEventsStore } from '../stores/eventsStore'
import { useEventActions } from '../composables/useEventActions'

type Tab = 'attending' | 'hosted'

const router = useRouter()
const store = useEventsStore()
const actions = useEventActions()
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

// Cancelamento precisa de campo de motivo: redireciona pro detail.
function onCancel(id: string) {
  router.push(`/roles/${id}`)
}

// Excluir não precisa de input — modal inline + chamada direta.
const deleteTargetId = ref<string | null>(null)
function onDelete(id: string) {
  deleteTargetId.value = id
}
async function confirmDelete() {
  const id = deleteTargetId.value
  if (!id) return
  await actions.deleteEvent(id)
  deleteTargetId.value = null
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
            @cancel="onCancel"
            @delete="onDelete"
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

    <!-- Delete confirm modal -->
    <div
      v-if="deleteTargetId"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="delete-modal"
      @click.self="deleteTargetId = null"
    >
      <div class="w-full max-w-md bg-[#1e2038] rounded-xl p-5 space-y-3 border border-red-900/40">
        <h3 class="text-sm font-bold text-slate-100">Excluir Rolê de vez?</h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          O evento será apagado do sistema. Inscritos ainda ativos serão avisados que o rolê não vai mais
          acontecer.
          <span class="text-red-300 font-semibold">Essa ação não pode ser desfeita.</span>
        </p>
        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            @click="deleteTargetId = null"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            Voltar
          </button>
          <button
            type="button"
            data-testid="confirm-delete"
            @click="confirmDelete"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-700 hover:bg-red-600 text-white"
          >
            Excluir definitivamente
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
