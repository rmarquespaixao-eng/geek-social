<script setup lang="ts">
import { computed } from 'vue'
import { Play } from 'lucide-vue-next'
import { isVideoUrl } from '@/shared/utils/mediaUtils'

const props = defineProps<{
  url: string
  /** Poster/thumbnail extraído server-side; se ausente, usa <video> pra mostrar 1º frame. */
  thumbnailUrl?: string | null
  /** Classes aplicadas no <img> ou <video>/wrapper. */
  mediaClass?: string
}>()

defineEmits<{ click: [] }>()

const isVideo = computed(() => isVideoUrl(props.url))
</script>

<template>
  <div
    v-if="isVideo"
    class="relative w-full h-full group"
    @click="$emit('click')"
  >
    <img
      v-if="thumbnailUrl"
      :src="thumbnailUrl"
      :class="mediaClass"
      alt=""
    />
    <video
      v-else
      :src="url"
      preload="metadata"
      muted
      playsinline
      :class="mediaClass"
    />
    <!-- Play overlay -->
    <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors pointer-events-none">
      <div class="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
        <Play :size="24" class="text-white ml-1" fill="white" />
      </div>
    </div>
  </div>
  <img
    v-else
    :src="url"
    :class="mediaClass"
    @click="$emit('click')"
  />
</template>
