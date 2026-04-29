<script setup lang="ts">
import { computed } from 'vue'
import ParticipantItem from './ParticipantItem.vue'
import type { EventParticipant } from '../types'

const props = defineProps<{
  participants: EventParticipant[]
}>()

const grouped = computed(() => {
  const confirmed = props.participants.filter(p => p.status === 'confirmed')
  const subscribed = props.participants.filter(p => p.status === 'subscribed')
  const waitlist = props.participants
    .filter(p => p.status === 'waitlist')
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
  return { confirmed, subscribed, waitlist }
})
</script>

<template>
  <div class="space-y-4" data-testid="participant-list">
    <section v-if="grouped.confirmed.length > 0">
      <h3 class="text-xs uppercase tracking-wider font-bold text-emerald-400 mb-1 px-3">
        Confirmados · {{ grouped.confirmed.length }}
      </h3>
      <ParticipantItem v-for="p in grouped.confirmed" :key="p.id" :participant="p" />
    </section>
    <section v-if="grouped.subscribed.length > 0">
      <h3 class="text-xs uppercase tracking-wider font-bold text-sky-400 mb-1 px-3">
        Inscritos · {{ grouped.subscribed.length }}
      </h3>
      <ParticipantItem v-for="p in grouped.subscribed" :key="p.id" :participant="p" />
    </section>
    <section v-if="grouped.waitlist.length > 0">
      <h3 class="text-xs uppercase tracking-wider font-bold text-purple-400 mb-1 px-3">
        Lista de espera · {{ grouped.waitlist.length }}
      </h3>
      <ParticipantItem v-for="p in grouped.waitlist" :key="p.id" :participant="p" />
    </section>
    <p
      v-if="grouped.confirmed.length + grouped.subscribed.length + grouped.waitlist.length === 0"
      class="text-sm text-slate-500 text-center py-6"
    >
      Ainda sem participantes.
    </p>
  </div>
</template>
