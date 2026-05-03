<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const variants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-indigo-100 text-indigo-700',
        success: 'bg-green-100 text-green-700',
        destructive: 'bg-red-100 text-red-700',
        warning: 'bg-amber-100 text-amber-700',
        secondary: 'bg-slate-100 text-slate-700',
        outline: 'border border-slate-300 text-slate-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type Variants = VariantProps<typeof variants>

const props = defineProps<{
  variant?: Variants['variant']
  class?: string
}>()

const cls = computed(() => cn(variants({ variant: props.variant }), props.class))
</script>

<template>
  <span :class="cls"><slot /></span>
</template>
