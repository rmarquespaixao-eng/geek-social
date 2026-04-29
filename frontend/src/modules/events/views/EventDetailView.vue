<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EventTicketCard from '../components/EventTicketCard.vue'
import ParticipantList from '../components/ParticipantList.vue'
import { useEventDetail } from '../composables/useEventDetail'
import { useEventActions } from '../composables/useEventActions'

const route = useRoute()
const router = useRouter()
const eventId = computed(() => String(route.params.id ?? ''))
const { event, loading, error, reload } = useEventDetail(() => eventId.value)
const actions = useEventActions()

const showCancelModal = ref(false)
const cancelReason = ref('')

async function onSubscribe() {
  await actions.subscribe(eventId.value)
  await reload()
}
async function onLeave() {
  await actions.leave(eventId.value)
  await reload()
}
async function onConfirm() {
  await actions.confirm(eventId.value)
  await reload()
}
function onEdit() {
  router.push(`/roles/${eventId.value}/editar`)
}
async function confirmCancel() {
  await actions.cancelEvent(eventId.value, cancelReason.value || undefined)
  showCancelModal.value = false
  await reload()
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="event-detail-view">
    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <button
        type="button"
        @click="router.push('/roles')"
        class="text-xs text-slate-400 hover:text-amber-400 transition-colors"
      >
        ← Voltar
      </button>

      <div v-if="loading && !event" class="text-slate-400 text-sm">Carregando…</div>
      <div v-else-if="error" class="text-red-400 text-sm">Erro ao carregar evento.</div>

      <template v-else-if="event">
        <EventTicketCard
          :event="event"
          :host-name="event.hostInfo.name"
          :cidade="event.address?.cidade"
          expanded
          @subscribe="onSubscribe"
          @leave="onLeave"
          @confirm="onConfirm"
          @edit="onEdit"
          @cancel="showCancelModal = true"
        />

        <section class="bg-[#1e2038] rounded-2xl p-4 space-y-2" data-testid="event-description">
          <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Descrição</h2>
          <p class="text-sm text-slate-300 whitespace-pre-line">
            {{ event.description || 'Sem descrição.' }}
          </p>
        </section>

        <section
          v-if="event.type === 'presencial' && event.address"
          class="bg-[#1e2038] rounded-2xl p-4 space-y-1"
          data-testid="event-address"
        >
          <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Endereço</h2>
          <p class="text-sm text-slate-300 font-mono">
            {{ event.address.logradouro }}, {{ event.address.numero }}
            <span v-if="event.address.complemento"> · {{ event.address.complemento }}</span>
          </p>
          <p class="text-sm text-slate-300">
            {{ event.address.bairro }} · {{ event.address.cidade }}/{{ event.address.estado }} · CEP {{ event.address.cep }}
          </p>
        </section>

        <section
          v-if="event.type === 'online' && event.onlineDetails"
          class="bg-[#1e2038] rounded-2xl p-4 space-y-1"
          data-testid="event-online-details"
        >
          <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Detalhes online</h2>
          <a
            :href="event.onlineDetails.meetingUrl"
            target="_blank"
            rel="noopener"
            class="text-sm text-sky-400 hover:underline break-all"
          >
            {{ event.onlineDetails.meetingUrl }}
          </a>
          <p
            v-if="event.onlineDetails.extraDetails"
            class="text-sm text-slate-300 whitespace-pre-line"
          >
            {{ event.onlineDetails.extraDetails }}
          </p>
        </section>

        <section class="bg-[#1e2038] rounded-2xl p-4">
          <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3">Participantes</h2>
          <ParticipantList :participants="event.participants" />
        </section>
      </template>
    </div>

    <!-- Cancel modal -->
    <div
      v-if="showCancelModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="cancel-modal"
      @click.self="showCancelModal = false"
    >
      <div class="w-full max-w-md bg-[#1e2038] rounded-xl p-5 space-y-3 border border-[#252640]">
        <h3 class="text-sm font-bold text-slate-100">Cancelar Rolê</h3>
        <textarea
          v-model="cancelReason"
          rows="3"
          placeholder="Motivo (opcional)"
          maxlength="500"
          data-testid="cancel-reason"
          class="w-full bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            @click="showCancelModal = false"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            Voltar
          </button>
          <button
            type="button"
            data-testid="confirm-cancel"
            @click="confirmCancel"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-400 text-white"
          >
            Cancelar Rolê
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
