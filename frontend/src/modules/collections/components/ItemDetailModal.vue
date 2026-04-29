<script setup lang="ts">
import { X } from 'lucide-vue-next'
import ItemDetailContent from './ItemDetailContent.vue'
import type { Item, CollectionSchemaEntry } from '../types'

defineProps<{
  item: Item
  fieldSchema?: CollectionSchemaEntry[]
  listing?: { id: string; availability: 'sale' | 'trade' | 'both'; askingPrice: string | null } | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div
        class="relative w-full max-w-2xl max-h-[90vh] overflow-hidden bg-[#1e2038] rounded-2xl border border-[#252640] shadow-2xl flex flex-col"
        @click.stop
      >
        <div class="flex items-center justify-between px-5 py-3 border-b border-[#252640]">
          <h2 class="text-base font-bold text-(--color-text-primary) truncate">{{ item.name }}</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="overflow-y-auto px-5 py-5">
          <ItemDetailContent
            :item="item"
            :field-schema="fieldSchema"
            variant="compact"
            :listing="listing ?? null"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
