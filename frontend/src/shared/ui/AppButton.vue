<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-(--color-bg-base) disabled:opacity-50 disabled:cursor-not-allowed',
      variantClasses[variant],
    ]"
    v-bind="$attrs"
  >
    <span v-if="loading" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  disabled?: boolean
}>(), {
  variant: 'primary',
  type: 'button',
  loading: false,
  disabled: false,
})

const variantClasses = {
  primary: 'bg-(--color-accent-amber) text-[#0f0f1a] hover:brightness-110 focus:ring-(--color-accent-amber)',
  ghost: 'bg-transparent text-(--color-text-secondary) hover:bg-(--color-bg-elevated) hover:text-(--color-text-primary) focus:ring-(--color-text-muted)',
  danger: 'bg-(--color-danger) text-white hover:brightness-110 focus:ring-(--color-danger)',
}
</script>
