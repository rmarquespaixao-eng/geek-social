<script setup lang="ts">
import { ref } from 'vue'
import { useCollectionsStore } from '../composables/useCollections'
import type { Collection } from '../types'

const props = defineProps<{
  collectionId: string
}>()

const emit = defineEmits<{
  coverUpdated: [collection: Collection]
}>()

const store = useCollectionsStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function openPicker() {
  fileInputRef.value?.click()
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  uploading.value = true
  const updated = await store.uploadCover(props.collectionId, file)
  uploading.value = false

  if (updated) emit('coverUpdated', updated)
  if (fileInputRef.value) fileInputRef.value.value = ''
}
</script>

<template>
  <div>
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileSelected"
    />
    <slot :open="openPicker" :uploading="uploading">
      <button
        type="button"
        class="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
        :disabled="uploading"
        @click="openPicker"
      >
        <span v-if="uploading" class="text-[10px] animate-spin">⏳</span>
        <span v-else class="text-[13px]">📷</span>
      </button>
    </slot>
  </div>
</template>
