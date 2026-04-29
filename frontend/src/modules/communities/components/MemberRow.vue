<script setup lang="ts">
import { computed } from 'vue'
import type { MemberWithUser, MemberRole, MemberStatus } from '../types'

const props = defineProps<{
  member: MemberWithUser
}>()

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Dono',
  moderator: 'Moderador',
  member: 'Membro',
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  moderator: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  member: 'bg-slate-600/20 text-slate-400 border border-slate-600/30',
}

const STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  banned: 'Banido',
}

const STATUS_COLORS: Record<MemberStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  pending: 'bg-yellow-500/10 text-yellow-400',
  banned: 'bg-red-500/10 text-red-400',
}

const initial = computed(() =>
  props.member.user.displayName ? props.member.user.displayName[0].toUpperCase() : '?',
)

const roleClass = computed(() => ROLE_COLORS[props.member.role])
const roleLabel = computed(() => ROLE_LABELS[props.member.role])
const statusClass = computed(() => STATUS_COLORS[props.member.status])
const statusLabel = computed(() => STATUS_LABELS[props.member.status])
</script>

<template>
  <div
    class="flex items-center gap-3 py-2.5 border-b border-[#252640] last:border-0"
    data-testid="member-row"
    :data-user-id="member.userId"
  >
    <!-- Avatar -->
    <div class="w-8 h-8 rounded-full bg-slate-600 overflow-hidden flex-shrink-0 flex items-center justify-center">
      <img
        v-if="member.user.avatarUrl"
        :src="member.user.avatarUrl"
        :alt="member.user.displayName"
        class="w-full h-full object-cover"
      />
      <span v-else class="text-xs font-bold text-slate-300">{{ initial }}</span>
    </div>

    <!-- Name -->
    <span class="flex-1 text-sm font-medium text-slate-200 truncate">{{ member.user.displayName }}</span>

    <!-- Badges -->
    <div class="flex items-center gap-1.5">
      <span :class="['px-1.5 py-0.5 rounded text-[10px] font-semibold', roleClass]">
        {{ roleLabel }}
      </span>
      <span
        v-if="member.status !== 'active'"
        :class="['px-1.5 py-0.5 rounded text-[10px] font-semibold', statusClass]"
      >
        {{ statusLabel }}
      </span>
    </div>

    <!-- Action slot -->
    <slot name="actions" />
  </div>
</template>
