<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  title: string
  /** Tailwind gradient classes for the icon box, e.g. 'from-[#f59e0b] to-[#d97706]' */
  iconGradient?: string
  /** Tailwind shadow color class, e.g. 'shadow-[#f59e0b]/20' */
  iconShadow?: string
}>()
</script>

<template>
  <div class="sticky top-0 z-10 bg-[#0f0f1a]/85 backdrop-blur-md border-b border-[#1a1b2e]">
    <div class="h-16 px-4 md:px-6 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg bg-gradient-to-br"
          :class="[
            iconGradient ?? 'from-[#f59e0b] to-[#d97706]',
            iconShadow ?? 'shadow-[#f59e0b]/20',
          ]"
        >
          <component :is="icon" :size="18" class="text-[#0f0f1a]" />
        </div>
        <div class="min-w-0">
          <h1 class="text-[16px] md:text-[18px] font-bold text-[#e2e8f0] leading-tight truncate">
            {{ title }}
          </h1>
          <div v-if="$slots.subtitle" class="text-[11px] text-[#94a3b8] mt-0.5 flex items-center gap-1.5 flex-wrap">
            <slot name="subtitle" />
          </div>
        </div>
      </div>
      <div v-if="$slots.action" class="flex-shrink-0">
        <slot name="action" />
      </div>
    </div>
  </div>
</template>
