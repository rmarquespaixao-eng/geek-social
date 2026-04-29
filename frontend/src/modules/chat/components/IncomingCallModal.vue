<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Phone, PhoneOff } from 'lucide-vue-next'
import { useCall } from '../composables/useCall'

const call = useCall()
const audioRef = ref<HTMLAudioElement | null>(null)

const visible = computed(() => call.state === 'ringing')

watch(visible, (v) => {
  const a = audioRef.value
  if (!a) return
  if (v) {
    a.currentTime = 0
    void a.play().catch(() => { /* autoplay bloqueado */ })
  } else {
    a.pause()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur"
    >
      <div class="bg-(--color-bg-surface) rounded-3xl p-8 flex flex-col items-center gap-6 min-w-[320px] shadow-2xl">
        <div class="flex flex-col items-center gap-3">
          <div class="relative">
            <img
              v-if="call.peer?.avatarUrl"
              :src="call.peer.avatarUrl"
              :alt="call.peer.displayName"
              class="w-28 h-28 rounded-full object-cover"
            />
            <div
              v-else
              class="w-28 h-28 rounded-full bg-slate-600 flex items-center justify-center text-3xl font-semibold text-slate-200"
            >
              {{ call.peer?.displayName.charAt(0).toUpperCase() ?? '?' }}
            </div>
            <span class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-(--color-accent-amber) flex items-center justify-center">
              <Phone class="w-4 h-4 text-black" />
            </span>
          </div>
          <p class="text-lg font-semibold text-(--color-text-primary)">
            {{ call.peer?.displayName ?? 'Usuário' }}
          </p>
          <p class="text-sm text-(--color-text-muted)">Chamada de vídeo recebida</p>
        </div>

        <div class="flex items-center gap-8">
          <button
            @click="call.reject()"
            title="Recusar"
            class="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center"
          >
            <PhoneOff :size="22" />
          </button>
          <button
            @click="call.accept()"
            title="Atender"
            class="w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 text-white flex items-center justify-center"
          >
            <Phone :size="22" />
          </button>
        </div>
      </div>
      <audio
        ref="audioRef"
        src="/sounds/ringtone.wav"
        loop
        preload="auto"
        class="hidden"
      ></audio>
    </div>
  </Teleport>
</template>
