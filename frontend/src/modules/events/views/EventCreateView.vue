<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import EventForm from '../components/EventForm.vue'
import { eventsApi } from '../services/eventsApi'
import type { CreateEventPayload } from '../types'

const router = useRouter()
const saving = ref(false)
const submitError = ref<string | null>(null)

async function onSubmit({ data, cover }: { data: CreateEventPayload; cover: File | null }) {
  if (!cover) {
    submitError.value = 'Capa é obrigatória.'
    return
  }
  saving.value = true
  submitError.value = null
  try {
    const created = await eventsApi.createEvent(data, cover)
    router.push(`/roles/${created.id}`)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Erro ao criar Rolê.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="event-create-view">
    <div class="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-100">Novo Rolê</h1>
        <button
          type="button"
          @click="router.back()"
          class="text-xs text-slate-400 hover:text-amber-400"
        >
          Cancelar
        </button>
      </header>

      <p v-if="submitError" class="text-sm text-red-400" data-testid="create-error">
        {{ submitError }}
      </p>

      <EventForm submit-label="Criar Rolê" :saving="saving" @submit="onSubmit" />
    </div>
  </div>
</template>
