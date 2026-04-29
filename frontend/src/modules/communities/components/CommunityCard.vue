<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { CommunitySummary, CommunityCategory } from '../types'

const props = defineProps<{
  community: CommunitySummary
}>()

const router = useRouter()

const CATEGORY_LABELS: Record<CommunityCategory, string> = {
  boardgames: 'Board Games',
  tcg: 'TCG',
  'rpg-mesa': 'RPG de Mesa',
  'rpg-digital': 'RPG Digital',
  mmo: 'MMO',
  souls: 'Souls-like',
  fps: 'FPS',
  survival: 'Survival',
  indie: 'Indie',
  retro: 'Retro',
  mobile: 'Mobile',
  simulation: 'Simulação',
  strategy: 'Estratégia',
  mods: 'Mods',
  'community-events': 'Eventos de Comunidade',
}

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Pública',
  restricted: 'Restrita',
  private: 'Privada',
}

const VISIBILITY_COLORS: Record<string, string> = {
  public: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  restricted: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  private: 'bg-slate-600/30 text-slate-400 border border-slate-500/30',
}

const categoryLabel = computed(() => CATEGORY_LABELS[props.community.category] ?? props.community.category)
const visibilityClass = computed(() => VISIBILITY_COLORS[props.community.visibility] ?? VISIBILITY_COLORS.public)
const visibilityLabel = computed(() => VISIBILITY_LABELS[props.community.visibility] ?? props.community.visibility)

function goDetail() {
  router.push(`/comunidades/${props.community.slug}`)
}
</script>

<template>
  <article
    class="bg-[#1e2038] rounded-2xl overflow-hidden border border-[#252640] hover:border-amber-500/30 transition-colors cursor-pointer"
    data-testid="community-card"
    :data-community-id="community.id"
    @click="goDetail"
  >
    <!-- Cover -->
    <div class="relative h-24 bg-slate-700">
      <img
        v-if="community.coverUrl"
        :src="community.coverUrl"
        :alt="community.name"
        class="w-full h-full object-cover"
      />
      <!-- Visibility badge -->
      <span
        :class="['absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold', visibilityClass]"
      >
        {{ visibilityLabel }}
      </span>
    </div>

    <!-- Icon + info -->
    <div class="p-3 flex gap-3">
      <!-- Icon -->
      <div class="w-10 h-10 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0 -mt-6 border-2 border-[#1e2038]">
        <img
          v-if="community.iconUrl"
          :src="community.iconUrl"
          :alt="`Ícone de ${community.name}`"
          class="w-full h-full object-cover"
        />
      </div>

      <div class="flex-1 min-w-0 pt-0.5">
        <h3 class="text-sm font-bold text-slate-100 truncate">{{ community.name }}</h3>
        <p class="text-xs text-slate-500 truncate mt-0.5">{{ community.description }}</p>

        <div class="flex flex-wrap items-center gap-1.5 mt-2">
          <!-- Category pill -->
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {{ categoryLabel }}
          </span>

          <!-- Member count -->
          <span class="text-[10px] text-slate-500">
            {{ community.memberCount.toLocaleString('pt-BR') }} membro{{ community.memberCount !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>
    </div>
  </article>
</template>
