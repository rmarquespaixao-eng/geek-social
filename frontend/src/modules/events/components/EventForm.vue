<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import DurationPicker from './DurationPicker.vue'
import AddressFields from './AddressFields.vue'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'
import type {
  CreateEventPayload,
  EventAddress,
  EventDetail,
  EventOnlineDetails,
  EventType,
  EventVisibility,
} from '../types'

const featureFlags = useFeatureFlagsStore()
const hasFriends = computed(() => featureFlags.isEnabled('module_friends'))

const props = defineProps<{
  initial?: EventDetail | null
  submitLabel?: string
  saving?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: { data: CreateEventPayload; cover: File | null }]
}>()

interface FormState {
  name: string
  description: string
  startsAt: string
  durationMinutes: number
  type: EventType
  visibility: EventVisibility
  capacity: number | null
  address: EventAddress
  onlineDetails: EventOnlineDetails
}

const emptyAddress: EventAddress = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
}

const emptyOnline: EventOnlineDetails = {
  meetingUrl: '',
  extraDetails: '',
}

function makeInitialForm(): FormState {
  if (props.initial) {
    return {
      name: props.initial.name,
      description: props.initial.description ?? '',
      startsAt: props.initial.startsAt.slice(0, 16),
      durationMinutes: props.initial.durationMinutes,
      type: props.initial.type,
      visibility: props.initial.visibility,
      capacity: props.initial.capacity,
      address: props.initial.address ? { ...emptyAddress, ...props.initial.address } : { ...emptyAddress },
      onlineDetails: props.initial.onlineDetails
        ? { ...emptyOnline, ...props.initial.onlineDetails }
        : { ...emptyOnline },
    }
  }
  return {
    name: '',
    description: '',
    startsAt: '',
    durationMinutes: 120,
    type: 'presencial',
    visibility: 'public',
    capacity: null,
    address: { ...emptyAddress },
    onlineDetails: { ...emptyOnline },
  }
}

const form = reactive<FormState>(makeInitialForm())

watch(
  () => props.initial,
  (next) => {
    if (next) Object.assign(form, makeInitialForm())
  },
)

watch(hasFriends, (enabled) => {
  if (!enabled && form.visibility === 'friends') form.visibility = 'public'
})

const cover = ref<File | null>(null)
const coverPreview = ref<string | null>(props.initial?.coverUrl ?? null)
const validationError = ref<string | null>(null)

function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  cover.value = file
  if (coverPreview.value && coverPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(coverPreview.value)
  }
  coverPreview.value = URL.createObjectURL(file)
}

function validate(): string | null {
  if (!form.name.trim()) return 'Nome é obrigatório.'
  if (!form.startsAt) return 'Data e hora são obrigatórias.'
  if (form.capacity != null && form.capacity < 1) return 'Capacidade mínima é 1.'
  if (!props.initial && !cover.value) return 'Capa é obrigatória.'
  if (form.type === 'presencial') {
    const a = form.address
    if (!a.cep || !a.logradouro || !a.numero || !a.bairro || !a.cidade || !a.estado) {
      return 'Preencha o endereço completo.'
    }
  } else {
    if (!form.onlineDetails.meetingUrl.trim()) return 'Link da reunião é obrigatório.'
  }
  return null
}

function onSubmit() {
  validationError.value = validate()
  if (validationError.value) return

  const payload: CreateEventPayload = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    startsAt: new Date(form.startsAt).toISOString(),
    durationMinutes: form.durationMinutes,
    type: form.type,
    visibility: form.visibility,
    capacity: form.capacity,
    address: form.type === 'presencial' ? { ...form.address } : null,
    onlineDetails: form.type === 'online' ? { ...form.onlineDetails } : null,
  }

  emit('submit', { data: payload, cover: cover.value })
}
</script>

<template>
  <form
    class="space-y-5"
    data-testid="event-form"
    @submit.prevent="onSubmit"
  >
    <!-- Cover -->
    <div>
      <label class="block text-xs font-semibold text-slate-300 mb-1">Capa</label>
      <div class="flex items-center gap-4">
        <div class="w-32 h-20 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
          <img
            v-if="coverPreview"
            :src="coverPreview"
            class="w-full h-full object-cover"
            alt="capa"
          />
          <span v-else class="text-xs text-slate-500">Sem capa</span>
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          data-testid="event-cover-input"
          @change="onCoverChange"
        />
      </div>
    </div>

    <!-- Name -->
    <label class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Nome do Rolê</span>
      <input
        v-model="form.name"
        data-testid="event-name"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>

    <!-- Description -->
    <label class="flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Descrição</span>
      <textarea
        v-model="form.description"
        rows="3"
        data-testid="event-description"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>

    <!-- Date + Duration -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-300">Início</span>
        <input
          v-model="form.startsAt"
          type="datetime-local"
          data-testid="event-starts-at"
          class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </label>
      <DurationPicker v-model="form.durationMinutes" />
    </div>

    <!-- Type + Visibility + Capacity -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-300">Tipo</span>
        <select
          v-model="form.type"
          data-testid="event-type"
          class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        >
          <option value="presencial">Presencial</option>
          <option value="online">Online</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-300">Visibilidade</span>
        <select
          v-model="form.visibility"
          data-testid="event-visibility"
          class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        >
          <option value="public">Público</option>
          <option v-if="hasFriends" value="friends">Só amigos</option>
          <option value="invite">Por convite</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-300">Capacidade (vazio = sem limite)</span>
        <input
          v-model.number="form.capacity"
          type="number"
          min="1"
          data-testid="event-capacity"
          class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </label>
    </div>

    <!-- Type-specific -->
    <div v-if="form.type === 'presencial'">
      <h3 class="text-xs uppercase tracking-wider font-bold text-amber-400 mb-2">Endereço</h3>
      <AddressFields v-model="form.address" />
    </div>
    <div v-else class="space-y-3" data-testid="online-details-fields">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-300">Link da reunião</span>
        <input
          v-model="form.onlineDetails.meetingUrl"
          data-testid="event-meeting-url"
          placeholder="https://…"
          class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-slate-300">Detalhes adicionais</span>
        <textarea
          v-model="form.onlineDetails.extraDetails"
          rows="2"
          data-testid="event-extra-details"
          class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </label>
    </div>

    <p v-if="validationError" class="text-sm text-red-400" data-testid="event-form-error">
      {{ validationError }}
    </p>

    <button
      type="submit"
      data-testid="event-form-submit"
      :disabled="saving"
      class="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0f0f1a] transition-colors"
    >
      {{ saving ? 'Salvando…' : (submitLabel ?? 'Criar Rolê') }}
    </button>
  </form>
</template>
