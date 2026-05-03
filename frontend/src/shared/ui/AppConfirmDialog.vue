<script setup lang="ts">
import AppModal from './AppModal.vue'
import AppButton from './AppButton.vue'

withDefaults(defineProps<{
  open: boolean
  title: string
  /** Opcional — preferível usar o slot default pra texto rico (negrito, links, etc). */
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
  showCancel?: boolean
}>(), {
  description: '',
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  variant: 'danger',
  loading: false,
  showCancel: true,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="sm" @close="emit('cancel')">
      <div class="p-6 space-y-4">
        <h2 class="text-base font-semibold text-(--color-text-primary)">{{ title }}</h2>
        <div class="text-sm text-(--color-text-secondary)">
          <slot>
            {{ description }}
          </slot>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <AppButton v-if="showCancel" variant="ghost" :disabled="loading" @click="emit('cancel')">
            {{ cancelLabel }}
          </AppButton>
          <AppButton :variant="variant" :loading="loading" @click="emit('confirm')">
            {{ confirmLabel }}
          </AppButton>
        </div>
      </div>
    </AppModal>
  </Teleport>
</template>
