<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-vue-next'
import { inferMediaType, downloadFile } from '@/shared/utils/mediaUtils'

export type LightboxItem = { url: string; type?: 'image' | 'video' }
type SrcInput = string | string[] | LightboxItem[] | null

const props = withDefaults(defineProps<{
  open: boolean
  /**
   * URL única (string), array de URLs (string[]), ou array de objetos `{url, type}` pra mídia mista.
   * Quando `string`/`string[]` é passado, infere `type` pela extensão da URL.
   */
  src?: SrcInput
  initialIndex?: number
  /** `contained` (default, retangular) ou `circular` (avatar redondo). */
  variant?: 'contained' | 'circular'
  alt?: string
}>(), {
  initialIndex: 0,
  variant: 'contained',
  alt: '',
  src: null,
})

const emit = defineEmits<{ close: [] }>()

const items = computed<LightboxItem[]>(() => {
  if (!props.src) return []
  if (typeof props.src === 'string') return [{ url: props.src, type: inferMediaType(props.src) }]
  return props.src.map(s => typeof s === 'string'
    ? { url: s, type: inferMediaType(s) }
    : { url: s.url, type: s.type ?? inferMediaType(s.url) })
})

const index = ref(props.initialIndex)

watch(() => props.open, (open) => { if (open) index.value = props.initialIndex })
watch(() => props.initialIndex, (i) => { index.value = i })

const hasMany = computed(() => items.value.length > 1)
const current = computed(() => items.value[index.value] ?? null)

function prev() {
  if (!hasMany.value) return
  index.value = (index.value - 1 + items.value.length) % items.value.length
}

function next() {
  if (!hasMany.value) return
  index.value = (index.value + 1) % items.value.length
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
}

async function downloadCurrent() {
  if (!current.value) return
  await downloadFile(current.value.url)
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && current"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      @click.self="emit('close')"
    >
      <button
        v-if="variant !== 'circular'"
        type="button"
        class="absolute top-4 right-16 text-white/70 hover:text-white p-2 z-10"
        title="Baixar"
        @click="downloadCurrent"
      >
        <Download :size="22" />
      </button>

      <button
        type="button"
        class="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10"
        title="Fechar"
        @click="emit('close')"
      >
        <X :size="24" />
      </button>

      <button
        v-if="hasMany"
        type="button"
        class="absolute left-4 text-white/70 hover:text-white p-2 z-10"
        title="Anterior"
        @click="prev"
      >
        <ChevronLeft :size="32" />
      </button>

      <video
        v-if="current.type === 'video'"
        :src="current.url"
        controls
        autoplay
        class="max-w-[90vw] max-h-[90vh] rounded-lg select-none bg-black"
        @click.stop
      />
      <img
        v-else
        :src="current.url"
        :alt="alt"
        :class="[
          'select-none shadow-2xl object-contain',
          variant === 'circular'
            ? 'max-w-[80vw] max-h-[80vh] rounded-full object-cover'
            : 'max-w-[90vw] max-h-[90vh] rounded-lg',
        ]"
        @click.stop
      />

      <button
        v-if="hasMany"
        type="button"
        class="absolute right-4 text-white/70 hover:text-white p-2 z-10"
        title="Próxima"
        @click="next"
      >
        <ChevronRight :size="32" />
      </button>

      <div v-if="hasMany" class="absolute bottom-4 flex gap-1.5">
        <div
          v-for="(_, i) in items"
          :key="i"
          :class="['w-1.5 h-1.5 rounded-full transition-colors', i === index ? 'bg-white' : 'bg-white/30']"
        />
      </div>
    </div>
  </Teleport>
</template>
