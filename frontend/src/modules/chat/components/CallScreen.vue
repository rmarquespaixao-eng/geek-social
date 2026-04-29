<script setup lang="ts">
import { computed, ref, watch, watchEffect, onUnmounted } from 'vue'
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-vue-next'
import { useCall } from '../composables/useCall'

const call = useCall()

const visible = computed(() => ['calling', 'connecting', 'active'].includes(call.state))
const localVideoRef = ref<HTMLVideoElement | null>(null)
const remoteVideoRef = ref<HTMLVideoElement | null>(null)

// watchEffect reage tanto à criação do <video> (ref) quanto à chegada do stream
watchEffect(() => {
  if (localVideoRef.value && call.localStream) {
    if (localVideoRef.value.srcObject !== call.localStream) {
      localVideoRef.value.srcObject = call.localStream
    }
  }
})

watchEffect(() => {
  if (remoteVideoRef.value && call.remoteStream) {
    if (remoteVideoRef.value.srcObject !== call.remoteStream) {
      remoteVideoRef.value.srcObject = call.remoteStream
    }
  }
})

const elapsed = ref(0)
let timerId: ReturnType<typeof setInterval> | null = null

watch(
  () => call.state,
  (s) => {
    if (s === 'active' && !timerId) {
      timerId = setInterval(() => {
        const start = call.startedAt
        if (start) elapsed.value = Math.floor((Date.now() - start.getTime()) / 1000)
      }, 1000)
    } else if (s !== 'active' && timerId) {
      clearInterval(timerId)
      timerId = null
      elapsed.value = 0
    }
  },
)

onUnmounted(() => { if (timerId) clearInterval(timerId) })

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const statusText = computed(() => {
  if (call.state === 'calling') return 'Chamando…'
  if (call.state === 'connecting') return 'Conectando…'
  if (call.state === 'active') return fmt(elapsed.value)
  return ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[90] bg-black flex flex-col">
      <!-- Header -->
      <div class="absolute top-0 left-0 right-0 p-4 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent z-10">
        <img
          v-if="call.peer?.avatarUrl"
          :src="call.peer.avatarUrl"
          :alt="call.peer.displayName"
          class="w-10 h-10 rounded-full object-cover"
        />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200"
        >
          {{ call.peer?.displayName.charAt(0).toUpperCase() ?? '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold truncate">{{ call.peer?.displayName ?? 'Usuário' }}</p>
          <p class="text-white/70 text-sm font-mono">{{ statusText }}</p>
        </div>
      </div>

      <!-- Remote video (cover) -->
      <div class="flex-1 flex items-center justify-center bg-black">
        <video
          v-show="call.remoteStream"
          ref="remoteVideoRef"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        ></video>
        <div
          v-show="!call.remoteStream"
          class="flex flex-col items-center gap-4 text-white/70"
        >
          <img
            v-if="call.peer?.avatarUrl"
            :src="call.peer.avatarUrl"
            :alt="call.peer.displayName"
            class="w-32 h-32 rounded-full object-cover"
          />
          <div
            v-else
            class="w-32 h-32 rounded-full bg-slate-600 flex items-center justify-center text-4xl font-semibold text-slate-200"
          >
            {{ call.peer?.displayName.charAt(0).toUpperCase() ?? '?' }}
          </div>
          <p class="text-lg">{{ statusText }}</p>
        </div>
      </div>

      <!-- Local video PiP -->
      <div class="absolute bottom-24 right-4 w-32 h-44 rounded-xl overflow-hidden bg-slate-800 border border-white/20 shadow-xl">
        <video
          v-show="call.localStream && !call.camMuted"
          ref="localVideoRef"
          autoplay
          playsinline
          muted
          class="w-full h-full object-cover scale-x-[-1]"
        ></video>
        <div
          v-show="!call.localStream || call.camMuted"
          class="w-full h-full flex items-center justify-center text-white/60"
        >
          <VideoOff :size="20" />
        </div>
      </div>

      <!-- Controls -->
      <div class="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
        <button
          @click="call.toggleMic()"
          :title="call.micMuted ? 'Ativar microfone' : 'Mutar microfone'"
          :class="[
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            call.micMuted ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white',
          ]"
        >
          <Mic v-if="!call.micMuted" :size="22" />
          <MicOff v-else :size="22" />
        </button>
        <button
          @click="call.endCall()"
          title="Encerrar"
          class="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center"
        >
          <PhoneOff :size="26" />
        </button>
        <button
          @click="call.toggleCam()"
          :title="call.camMuted ? 'Ativar câmera' : 'Desligar câmera'"
          :class="[
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            call.camMuted ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white',
          ]"
        >
          <Video v-if="!call.camMuted" :size="22" />
          <VideoOff v-else :size="22" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
