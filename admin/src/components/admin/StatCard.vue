<script setup lang="ts">
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

defineProps<{
  title: string
  value: string | number
  delta?: string
  deltaUp?: boolean
  icon: any
  iconColor?: string
}>()
</script>

<template>
  <Card>
    <CardContent class="p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-slate-500">{{ title }}</p>
          <p class="mt-1 text-3xl font-bold text-slate-900">{{ value }}</p>
          <p v-if="delta" :class="['mt-1 text-xs font-medium', deltaUp ? 'text-green-600' : 'text-red-600']">
            {{ deltaUp ? '▲' : '▼' }} {{ delta }}
          </p>
        </div>
        <div :class="['flex h-12 w-12 items-center justify-center rounded-lg', iconColor || 'bg-indigo-50']">
          <component :is="icon" class="h-6 w-6" :class="iconColor ? 'text-white' : 'text-indigo-600'" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>
