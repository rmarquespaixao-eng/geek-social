<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import EventStatusBadge from './EventStatusBadge.vue'
import EventTypeBadge from './EventTypeBadge.vue'
import CapacityIndicator from './CapacityIndicator.vue'
import WaitlistPositionBadge from './WaitlistPositionBadge.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import type { EventSummary } from '../types'

const props = defineProps<{
  event: EventSummary
  hostName?: string
  cidade?: string
  /** When true, hides the "ver detalhes" link (we're already on detail view). */
  expanded?: boolean
}>()

const emit = defineEmits<{
  subscribe: [id: string]
  leave: [id: string]
  confirm: [id: string]
  edit: [id: string]
  cancel: [id: string]
  delete: [id: string]
  'view-participants': [id: string]
}>()

const router = useRouter()
const auth = useAuthStore()

const isHost = computed(() => props.event.hostUserId === auth.user?.id)

const startsDate = computed(() => new Date(props.event.startsAt))
const endsDate = computed(() => new Date(props.event.endsAt))

const dayLabel = computed(() => {
  return startsDate.value.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
})

const timeLabel = computed(() => {
  const fmt = (d: Date) =>
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(startsDate.value)}–${fmt(endsDate.value)}`
})

const dayStub = computed(() => ({
  weekday: startsDate.value.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase(),
  day: String(startsDate.value.getDate()).padStart(2, '0'),
  month: startsDate.value.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
  start: startsDate.value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
}))

const within48h = computed(() => {
  const diff = startsDate.value.getTime() - Date.now()
  return diff > 0 && diff <= 48 * 60 * 60 * 1000
})

const confirmedCount = computed(() => props.event.confirmedCount ?? 0)
const waitlistCount = computed(() => props.event.waitlistCount ?? 0)
const isFull = computed(
  () => props.event.capacity != null && confirmedCount.value >= props.event.capacity,
)

interface PrimaryAction {
  text: string
  variant: 'primary' | 'danger' | 'ghost'
  disabled: boolean
  event: 'subscribe' | 'leave' | 'confirm' | 'edit' | 'none'
}

const primaryAction = computed<PrimaryAction>(() => {
  if (props.event.status === 'cancelled') {
    return { text: 'Cancelado', variant: 'ghost', disabled: true, event: 'none' }
  }
  if (props.event.status === 'ended') {
    return { text: 'Encerrado', variant: 'ghost', disabled: true, event: 'none' }
  }
  if (isHost.value) {
    return { text: 'Editar', variant: 'primary', disabled: false, event: 'edit' }
  }
  const me = props.event.iAmIn
  if (!me) {
    if (isFull.value) {
      const queueAhead = waitlistCount.value
      return {
        text: `Entrar na lista de espera (${queueAhead} na fila)`,
        variant: 'ghost',
        disabled: false,
        event: 'subscribe',
      }
    }
    return { text: 'Inscrever-se', variant: 'primary', disabled: false, event: 'subscribe' }
  }
  if (me.status === 'waitlist') {
    return {
      text: `Sair da fila (posição ${me.waitlistPosition ?? '?'})`,
      variant: 'danger',
      disabled: false,
      event: 'leave',
    }
  }
  if (me.status === 'subscribed' && within48h.value) {
    return { text: 'Confirmar presença', variant: 'primary', disabled: false, event: 'confirm' }
  }
  if (me.status === 'subscribed' || me.status === 'confirmed') {
    return { text: 'Sair', variant: 'danger', disabled: false, event: 'leave' }
  }
  return { text: 'Inscrever-se', variant: 'primary', disabled: false, event: 'subscribe' }
})

function handlePrimary() {
  switch (primaryAction.value.event) {
    case 'subscribe':
      emit('subscribe', props.event.id)
      break
    case 'leave':
      emit('leave', props.event.id)
      break
    case 'confirm':
      emit('confirm', props.event.id)
      break
    case 'edit':
      router.push(`/roles/${props.event.id}/editar`)
      break
  }
}

function goDetail() {
  router.push(`/roles/${props.event.id}`)
}

const variantClass: Record<'primary' | 'danger' | 'ghost', string> = {
  primary: 'bg-amber-500 hover:bg-amber-400 text-[#0f0f1a]',
  danger: 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30',
  ghost: 'bg-slate-700/40 text-slate-400 cursor-not-allowed',
}
</script>

<template>
  <article
    class="event-ticket relative bg-[#1e2038] rounded-2xl overflow-hidden border border-[#252640]"
    data-testid="event-ticket-card"
    :data-event-id="event.id"
  >
    <!-- Cover -->
    <div class="relative h-20 bg-slate-700">
      <img
        v-if="event.coverUrl"
        :src="event.coverUrl"
        :alt="event.name"
        class="w-full h-full object-cover"
      />
      <div class="absolute top-1.5 right-1.5 flex gap-1">
        <EventStatusBadge :status="event.status" />
        <EventTypeBadge :type="event.type" />
      </div>
      <WaitlistPositionBadge
        v-if="event.iAmIn?.status === 'waitlist' && event.iAmIn.waitlistPosition"
        :position="event.iAmIn.waitlistPosition"
        class="absolute top-1.5 left-1.5"
      />
    </div>

    <!-- Body: stub + content -->
    <div class="flex">
      <!-- Stub (~30% width) -->
      <div
        class="event-ticket-stub w-[30%] flex flex-row items-center justify-center gap-1.5 py-2.5 px-1.5 border-r border-dashed border-slate-600/60 bg-[#181a30]"
      >
        <div class="flex flex-col items-center leading-none">
          <p class="text-[9px] font-mono uppercase text-slate-500">{{ dayStub.weekday }}</p>
          <p class="text-xl font-mono font-bold text-amber-400 leading-none">{{ dayStub.day }}</p>
          <p class="text-[9px] font-mono uppercase text-slate-400">{{ dayStub.month }}</p>
        </div>
        <p class="text-xs font-mono font-semibold text-slate-300 whitespace-nowrap">{{ dayStub.start }}</p>
      </div>

      <!-- Content body -->
      <div class="flex-1 p-3 space-y-1.5 min-w-0">
        <h3 class="text-sm font-bold text-slate-100 truncate">{{ event.name }}</h3>
        <div class="space-y-0.5 text-[11px] text-slate-400">
          <p class="font-mono">📅 {{ dayLabel }} · {{ timeLabel }}</p>
          <p v-if="event.type === 'online'">🌐 Online</p>
          <p v-else-if="cidade">📍 {{ cidade }}</p>
          <CapacityIndicator
            :confirmed="confirmedCount"
            :capacity="event.capacity"
            :waitlist="waitlistCount"
          />
          <p v-if="hostName" class="text-slate-500">👤 por {{ hostName }}</p>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            data-testid="primary-action"
            :class="['px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors', variantClass[primaryAction.variant]]"
            :disabled="primaryAction.disabled"
            @click="handlePrimary"
          >
            {{ primaryAction.text }}
          </button>

          <button
            v-if="!expanded"
            type="button"
            data-testid="view-detail"
            @click="goDetail"
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 transition-colors"
          >
            Ver detalhes
          </button>

          <button
            type="button"
            data-testid="view-participants"
            @click="emit('view-participants', event.id)"
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 transition-colors"
          >
            Ver participantes
          </button>

          <button
            v-if="isHost && event.status === 'scheduled'"
            type="button"
            data-testid="cancel-event"
            @click="emit('cancel', event.id)"
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-colors"
          >
            Cancelar Rolê
          </button>

          <button
            v-if="isHost"
            type="button"
            data-testid="delete-event"
            @click="emit('delete', event.id)"
            class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-700/20 hover:bg-red-700/30 text-red-300 border border-red-700/40 transition-colors"
            title="Apagar este rolê de vez. Inscritos ainda ativos serão avisados."
          >
            Excluir Rolê
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Perforated ticket effect — circles at the seam between stub and body. */
.event-ticket {
  --hole: 7px;
  -webkit-mask-image:
    radial-gradient(circle at 30% 5rem, transparent var(--hole), black calc(var(--hole) + 1px)),
    radial-gradient(circle at 30% 100%, transparent var(--hole), black calc(var(--hole) + 1px));
  -webkit-mask-composite: source-in;
          mask-composite: intersect;
}
</style>
