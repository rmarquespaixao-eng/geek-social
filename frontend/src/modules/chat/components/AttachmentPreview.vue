<!-- src/modules/chat/components/AttachmentPreview.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { X, FileText } from 'lucide-vue-next'

const props = defineProps<{
  file: File
}>()

const emit = defineEmits<{
  (e: 'remove'): void
}>()

const previewUrl = ref<string | null>(null)

onMounted(() => {
  if (props.file.type.startsWith('image/')) {
    previewUrl.value = URL.createObjectURL(props.file)
  }
})

onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="relative inline-flex flex-col items-center gap-1">
    <!-- Image preview -->
    <div v-if="previewUrl" class="relative">
      <img
        :src="previewUrl"
        :alt="file.name"
        class="w-16 h-16 rounded-lg object-cover border border-(--color-bg-elevated)"
      />
    </div>

    <!-- File preview -->
    <div
      v-else
      class="w-16 h-16 rounded-lg bg-(--color-bg-elevated) flex flex-col items-center justify-center gap-1 border border-(--color-bg-surface)"
    >
      <FileText :size="20" class="text-(--color-text-muted)" />
    </div>

    <span class="text-[10px] text-(--color-text-muted) max-w-[64px] truncate">{{ file.name }}</span>

    <!-- Remove button -->
    <button
      @click="emit('remove')"
      class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition-colors"
    >
      <X :size="10" />
    </button>
  </div>
</template>
