<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EventForm from '../components/EventForm.vue'
import { eventsApi } from '../services/eventsApi'
import { useEventDetail } from '../composables/useEventDetail'
import type { CreateEventPayload } from '../types'

const route = useRoute()
const router = useRouter()
const eventId = computed(() => String(route.params.id ?? ''))
const { event, loading } = useEventDetail(() => eventId.value)
const saving = ref(false)
const submitError = ref<string | null>(null)

async function onSubmit({ data, cover }: { data: CreateEventPayload; cover: File | null }) {
  saving.value = true
  submitError.value = null
  try {
    await eventsApi.updateEvent(eventId.value, data, cover)
    router.push(`/roles/${eventId.value}`)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Erro ao salvar Rolê.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="event-edit-view">
    <div class="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-100">Editar Rolê</h1>
        <button
          type="button"
          @click="router.back()"
          class="text-xs text-slate-400 hover:text-amber-400"
        >
          Cancelar
        </button>
      </header>

      <p v-if="loading" class="text-slate-400 text-sm">Carregando…</p>

      <p v-if="submitError" class="text-sm text-red-400" data-testid="edit-error">
        {{ submitError }}
      </p>

      <EventForm
        v-if="event"
        :initial="event"
        submit-label="Salvar alterações"
        :saving="saving"
        @submit="onSubmit"
      />
    </div>
  </div>
</template>
