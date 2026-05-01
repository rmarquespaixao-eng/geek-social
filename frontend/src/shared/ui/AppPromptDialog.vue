<script setup lang="ts">
import { ref, watch } from 'vue'
import AppModal from './AppModal.vue'
import AppButton from './AppButton.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  required?: boolean
  loading?: boolean
}>(), {
  description: '',
  placeholder: '',
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  required: false,
  loading: false,
})

const emit = defineEmits<{
  confirm: [value: string]
  cancel: []
}>()

const inputValue = ref('')

watch(() => props.open, (open) => {
  if (open) inputValue.value = ''
})
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="sm" @close="emit('cancel')">
      <div class="p-6 space-y-4">
        <h2 class="text-base font-semibold text-(--color-text-primary)">{{ title }}</h2>
        <p v-if="description" class="text-sm text-(--color-text-secondary)">{{ description }}</p>
        <input
          v-model="inputValue"
          :placeholder="placeholder"
          class="w-full bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-slate-500"
          @keydown.enter.prevent="!required || inputValue.trim() ? emit('confirm', inputValue.trim()) : undefined"
          @keydown.escape.prevent="emit('cancel')"
        />
        <div class="flex justify-end gap-2 pt-1">
          <AppButton variant="ghost" :disabled="loading" @click="emit('cancel')">
            {{ cancelLabel }}
          </AppButton>
          <AppButton
            variant="danger"
            :loading="loading"
            :disabled="required && !inputValue.trim()"
            @click="emit('confirm', inputValue.trim())"
          >
            {{ confirmLabel }}
          </AppButton>
        </div>
      </div>
    </AppModal>
  </Teleport>
</template>
