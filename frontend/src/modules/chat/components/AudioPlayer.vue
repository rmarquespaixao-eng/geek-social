<script setup lang="ts">
import { computed, ref } from 'vue'
import { Play, Pause } from 'lucide-vue-next'
import type { MessageAttachment } from '../types'

const props = defineProps<{ attachment: MessageAttachment }>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentMs = ref(0)
const totalMs = computed(() => props.attachment.durationMs ?? 0)

const peaks = computed<number[]>(() => {
  const p = props.attachment.waveformPeaks
  if (Array.isArray(p) && p.length === 64) return p
  return new Array(64).fill(0.05)
})

const progress = computed(() => (totalMs.value > 0 ? currentMs.value / totalMs.value : 0))

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function toggle() {
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

function onTimeUpdate() {
  const a = audioRef.value
  if (a) currentMs.value = Math.floor(a.currentTime * 1000)
}

function seek(e: MouseEvent) {
  const a = audioRef.value
  if (!a || !totalMs.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  a.currentTime = (totalMs.value / 1000) * ratio
  currentMs.value = Math.floor(a.currentTime * 1000)
}

function onEnded() {
  isPlaying.value = false
  currentMs.value = 0
}
</script>

<template>
  <div class="flex items-center gap-3 min-w-[220px] max-w-[320px]">
    <button
      type="button"
      class="w-10 h-10 rounded-full bg-amber-500 text-black hover:bg-amber-400 flex items-center justify-center shrink-0"
      @click="toggle"
    >
      <Pause v-if="isPlaying" class="w-4 h-4" />
      <Play v-else class="w-4 h-4 ml-0.5" />
    </button>
    <div class="flex-1 min-w-0">
      <div class="relative h-7 cursor-pointer flex items-end gap-[2px]" @click="seek">
        <div
          v-for="(p, i) in peaks"
          :key="i"
          class="flex-1 rounded-sm"
          :class="i / peaks.length <= progress ? 'bg-amber-400' : 'bg-white/30'"
          :style="{ height: Math.max(3, p * 28) + 'px' }"
        ></div>
      </div>
      <div class="text-[11px] font-mono text-white/60 tabular-nums mt-1">
        {{ fmt(currentMs) }} / {{ fmt(totalMs) }}
      </div>
    </div>
    <audio
      ref="audioRef"
      :src="attachment.url"
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @pause="isPlaying = false"
      @play="isPlaying = true"
      @ended="onEnded"
      class="hidden"
    ></audio>
  </div>
</template>
