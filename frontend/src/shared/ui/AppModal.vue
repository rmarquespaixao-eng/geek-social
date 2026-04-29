<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>(), { size: 'md' })

const emit = defineEmits<{
  close: []
}>()

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'max-w-sm'
    case 'lg': return 'max-w-lg'
    case 'xl': return 'max-w-2xl'
    default:   return 'max-w-md'
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Overlay -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <!-- Modal container — limita altura e scrolla conteúdo quando excede o viewport -->
    <div
      class="w-full max-h-[calc(100vh-2rem)] overflow-y-auto bg-[#1e2038] rounded-[10px] border border-[#252640] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      :class="sizeClass"
      @click.stop
    >
      <slot />
    </div>
  </div>
</template>
