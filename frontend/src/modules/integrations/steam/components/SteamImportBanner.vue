<template>
  <div
    v-if="visible"
    class="fixed bottom-4 right-4 z-40 bg-(--color-bg-card) border border-(--color-bg-elevated) rounded-2xl shadow-2xl px-4 py-3 max-w-sm w-full"
    :class="isDone ? 'border-(--color-status-online)/30' : ''"
  >
    <div class="flex items-start gap-3">
      <div
        class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        :class="isDone
          ? 'bg-(--color-status-online)/20 text-(--color-status-online)'
          : 'bg-(--color-accent-amber)/20 text-(--color-accent-amber)'"
      >
        <Loader2 v-if="!isDone" :size="18" class="animate-spin" />
        <Check v-else :size="18" />
      </div>

      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-(--color-text-primary)">
          {{ headerText }}
        </p>

        <template v-if="!isDone && current">
          <div class="mt-2 h-1 bg-(--color-bg-elevated) rounded-full overflow-hidden">
            <div
              class="h-full bg-(--color-accent-amber) transition-all duration-500"
              :style="{ width: progressPct + '%' }"
            />
          </div>
          <p class="text-xs text-(--color-text-muted) mt-1.5 truncate min-h-[1rem]">
            <Transition name="fade-name" mode="out-in">
              <span :key="current.currentName ?? '__waiting__'">
                {{ current.currentName ?? 'Aguardando...' }}
              </span>
            </Transition>
          </p>
        </template>

        <template v-else-if="isDone && current">
          <p class="text-xs text-(--color-text-muted) mt-1">
            {{ current.completed }} jogos importados
            <span v-if="current.failed > 0" class="text-(--color-danger)">— {{ current.failed }} falharam</span>
          </p>
          <p
            v-if="current.backgroundEnrichment"
            class="text-xs text-(--color-text-muted) mt-1.5 leading-snug"
          >
            Estamos buscando detalhes (gênero, ano, dev) em segundo plano. Avisaremos quando terminar.
          </p>
          <div class="flex gap-2 mt-2">
            <button
              class="text-xs px-3 py-1.5 rounded-lg bg-(--color-accent-amber) text-(--color-bg-base) hover:brightness-110"
              @click="goToCollection"
            >
              Ver coleção
            </button>
            <button
              class="text-xs px-3 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:bg-(--color-bg-elevated)/70"
              @click="dismiss"
            >
              Fechar
            </button>
          </div>
        </template>
      </div>

      <button
        v-if="!isDone"
        class="text-(--color-text-muted) hover:text-(--color-text-primary)"
        @click="minimized = !minimized"
        :title="minimized ? 'Expandir' : 'Minimizar'"
      >
        <ChevronUp v-if="minimized" :size="16" />
        <ChevronDown v-else :size="16" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, Check, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { useSteam } from '../composables/useSteam'

const steam = useSteam()
const router = useRouter()

const minimized = ref(false)
const dismissed = ref(false)

const current = computed(() => steam.currentImport)
const isDone = computed(() => current.value?.stage === 'done')

const visible = computed(() => Boolean(current.value) && !dismissed.value)

const headerText = computed(() => {
  if (!current.value) return ''
  if (current.value.stage === 'importing') return 'Importando jogos da Steam...'
  return 'Importação concluída!'
})

const progressPct = computed(() => {
  const c = current.value
  if (!c || c.total === 0) return 0
  return Math.min(100, Math.round((c.completed / c.total) * 100))
})

function goToCollection() {
  if (current.value?.collectionId) {
    router.push(`/collections/${current.value.collectionId}`)
  }
  dismiss()
}

function dismiss() {
  dismissed.value = true
  steam.clearCurrentImport()
}

// Auto-fechar 30s depois de done
watch(isDone, (done) => {
  if (done) {
    setTimeout(() => {
      if (isDone.value) dismiss()
    }, 30_000)
  }
})

// Reseta dismissed quando começa nova importação
watch(() => current.value?.batchId, (id, oldId) => {
  if (id && id !== oldId) dismissed.value = false
})
</script>

<style scoped>
.fade-name-enter-active,
.fade-name-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.fade-name-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.fade-name-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
