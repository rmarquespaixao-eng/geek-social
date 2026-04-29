<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Square, X, Send, Play, Pause, Trash2 } from 'lucide-vue-next'
import type { RecorderState } from '../composables/useAudioRecorder'

const props = defineProps<{
  state: RecorderState
  elapsedMs: number
  durationMs: number | null
  peaks: number[] | null
  recordedBlob: Blob | null
}>()

const emit = defineEmits<{
  (e: 'stop'): void
  (e: 'discard'): void
  (e: 'send'): void
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const blobUrl = ref<string | null>(null)

watch(
  () => props.recordedBlob,
  (b) => {
    if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = b ? URL.createObjectURL(b) : null
    isPlaying.value = false
  },
  { immediate: true },
)

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function togglePlay() {
  const a = audioRef.value
  if (!a) return
  if (a.paused) {
    void a.play()
    isPlaying.value = true
  } else {
    a.pause()
    isPlaying.value = false
  }
}

const peaksDisplay = computed(() => props.peaks ?? [])
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-2 bg-[#1e2038] rounded-xl border border-white/5">
    <template v-if="state === 'recording'">
      <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
      <span class="font-mono text-sm text-white/90 tabular-nums">{{ fmt(elapsedMs) }}</span>
      <span class="text-white/40 text-xs">/ 03:00</span>
      <div class="flex-1"></div>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-white/70 hover:bg-white/10 text-sm flex items-center gap-1"
        @click="emit('discard')"
      >
        <X class="w-4 h-4" /> Cancelar
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 text-sm font-medium flex items-center gap-1"
        @click="emit('stop')"
      >
        <Square class="w-4 h-4" /> Parar
      </button>
    </template>

    <template v-else-if="state === 'preview' || state === 'uploading'">
      <button
        type="button"
        class="w-9 h-9 rounded-full bg-amber-500 text-black hover:bg-amber-400 flex items-center justify-center"
        @click="togglePlay"
      >
        <Pause v-if="isPlaying" class="w-4 h-4" />
        <Play v-else class="w-4 h-4 ml-0.5" />
      </button>
      <div class="flex items-end gap-[2px] h-6 flex-1 max-w-[160px]">
        <div
          v-for="(p, i) in peaksDisplay"
          :key="i"
          class="w-[2px] bg-white/40 rounded-sm"
          :style="{ height: Math.max(2, p * 24) + 'px' }"
        ></div>
      </div>
      <span class="font-mono text-sm text-white/80 tabular-nums">{{ fmt(durationMs ?? 0) }}</span>
      <audio
        v-if="blobUrl"
        ref="audioRef"
        :src="blobUrl"
        @ended="isPlaying = false"
        @pause="isPlaying = false"
        class="hidden"
      ></audio>
      <div class="flex-1"></div>
      <button
        type="button"
        :disabled="state === 'uploading'"
        class="px-3 py-1.5 rounded-lg text-white/70 hover:bg-white/10 text-sm flex items-center gap-1 disabled:opacity-50"
        @click="emit('discard')"
      >
        <Trash2 class="w-4 h-4" /> Descartar
      </button>
      <button
        type="button"
        :disabled="state === 'uploading'"
        class="px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
        @click="emit('send')"
      >
        <Send class="w-4 h-4" />
        {{ state === 'uploading' ? 'Enviando…' : 'Enviar' }}
      </button>
    </template>

    <template v-else-if="state === 'error'">
      <span class="text-red-400 text-sm">Não foi possível acessar o microfone.</span>
      <div class="flex-1"></div>
      <button class="px-2 py-1 text-white/60 hover:text-white" @click="emit('discard')">
        <X class="w-4 h-4" />
      </button>
    </template>
  </div>
</template>
