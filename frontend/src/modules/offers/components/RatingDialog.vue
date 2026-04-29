<script setup lang="ts">
import { ref, watch } from 'vue'
import { Star, AlertTriangle } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import { submitRating, type ListingRating } from '../services/ratingsService'

const props = defineProps<{
  open: boolean
  offerId: string
  rateeDisplayName: string
  existingRating: ListingRating | null
}>()

const emit = defineEmits<{
  close: []
  rated: []
}>()

const score = ref<number>(0)
const submitting = ref(false)
const error = ref<string | null>(null)
const hovered = ref<number>(0)

watch(() => props.open, (open) => {
  if (open) {
    score.value = 0
    error.value = null
    hovered.value = 0
  }
})

async function submit() {
  if (!score.value || submitting.value || props.existingRating) return
  submitting.value = true
  error.value = null
  try {
    await submitRating(props.offerId, score.value)
    emit('rated')
    emit('close')
  } catch (e: any) {
    const code = e?.response?.data?.error
    error.value = code === 'ALREADY_RATED' ? 'Você já avaliou esta transação.'
                : 'Erro ao salvar avaliação.'
  } finally {
    submitting.value = false
  }
}

const LABELS = ['', 'Ruim', 'Regular', 'Ok', 'Bom', 'Excelente']
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="sm" @close="emit('close')">
      <div class="p-5 space-y-4">
        <div>
          <h2 class="text-base font-semibold text-(--color-text-primary)">
            {{ existingRating ? 'Sua avaliação' : 'Avaliar transação' }}
          </h2>
          <p class="text-xs text-(--color-text-muted)">
            {{ existingRating ? `Você avaliou ${rateeDisplayName}` : `Como foi negociar com ${rateeDisplayName}?` }}
          </p>
        </div>

        <!-- Visualização da nota existente (read-only) -->
        <template v-if="existingRating">
          <div class="flex justify-center gap-2 py-2">
            <Star
              v-for="n in 5"
              :key="n"
              :size="32"
              :fill="existingRating.score >= n ? '#f59e0b' : 'transparent'"
              :stroke="existingRating.score >= n ? '#f59e0b' : '#475569'"
            />
          </div>
          <p class="text-center text-sm text-(--color-text-secondary)">
            {{ LABELS[existingRating.score] }}
          </p>
          <p class="text-center text-[11px] text-(--color-text-muted) italic">
            Avaliações são definitivas e não podem ser alteradas.
          </p>

          <div class="flex justify-end pt-1">
            <AppButton variant="ghost" @click="emit('close')">
              Fechar
            </AppButton>
          </div>
        </template>

        <!-- Picker para nova avaliação -->
        <template v-else>
          <div class="flex justify-center gap-2">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              class="transition-transform hover:scale-110"
              @mouseenter="hovered = n"
              @mouseleave="hovered = 0"
              @click="score = n"
            >
              <Star
                :size="32"
                :fill="(hovered || score) >= n ? '#f59e0b' : 'transparent'"
                :stroke="(hovered || score) >= n ? '#f59e0b' : '#475569'"
              />
            </button>
          </div>
          <p class="text-center text-sm text-(--color-text-secondary) min-h-[20px]">
            {{ LABELS[hovered || score] }}
          </p>
          <p class="text-center text-[11px] text-(--color-text-muted) italic">
            A avaliação é definitiva — confirme antes de enviar.
          </p>

          <div v-if="error" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-(--color-danger)/10 text-(--color-danger) text-xs">
            <AlertTriangle :size="14" class="mt-0.5 flex-shrink-0" />
            {{ error }}
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              :disabled="submitting"
              @click="emit('close')"
            >
              Cancelar
            </button>
            <AppButton variant="primary" :loading="submitting" :disabled="!score" @click="submit">
              Avaliar
            </AppButton>
          </div>
        </template>
      </div>
    </AppModal>
  </Teleport>
</template>
