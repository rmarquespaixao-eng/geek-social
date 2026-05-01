<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommunityForm from '../components/CommunityForm.vue'
import { useCommunity } from '../composables/useCommunity'
import { useCommunityActions } from '../composables/useCommunityActions'
import type { CreateCommunityPayload, UpdateCommunityPayload } from '../types'

const route = useRoute()
const router = useRouter()

const slug = computed(() => String(route.params.slug ?? ''))
const { community, viewerMembership, loading, error } = useCommunity(() => slug.value)
const actions = useCommunityActions()

// Guard: only owner may access this view. Router does not enforce role — we do it here.
const isOwner = computed(() => viewerMembership.value?.role === 'owner')

async function onSubmit(payload: CreateCommunityPayload & UpdateCommunityPayload, cover: File | null, icon: File | null) {
  if (!community.value) return
  const slug = community.value.slug
  try {
    await actions.update(community.value.id, payload, cover, icon)
    router.replace(`/comunidades/${slug}`)
  } catch {
    // error surfaced via actions.error.value bound to CommunityForm :error prop
  }
}

async function onDelete() {
  if (!community.value) return
  if (!confirm('Tem certeza? A comunidade será desativada.')) return
  try {
    await actions.softDelete(community.value.id)
  } catch {
    // error surfaced via actions.error.value
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="community-edit-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-2xl mx-auto px-4 flex items-center gap-3">
        <button
          type="button"
          @click="router.push(`/comunidades/${slug}`)"
          class="text-xs text-slate-400 hover:text-amber-400 transition-colors"
        >
          ← Voltar
        </button>
        <h1 class="text-xl font-bold text-slate-100">Editar comunidade</h1>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div v-if="loading && !community" class="text-slate-400 text-sm">Carregando…</div>
      <div v-else-if="error" class="text-red-400 text-sm">Erro ao carregar comunidade.</div>

      <!-- Guard: only owner may see edit form -->
      <div
        v-else-if="community && !isOwner"
        class="text-slate-400 text-sm text-center py-12"
      >
        Apenas o dono pode editar esta comunidade.
      </div>

      <template v-else-if="community && isOwner">
        <div class="bg-[#1e2038] rounded-2xl p-5 border border-[#252640]">
          <CommunityForm
            :initial="community"
            :loading="actions.acting.value"
            :error="actions.error.value"
            @submit="onSubmit"
            @cancel="router.push(`/comunidades/${slug}`)"
          />
        </div>

        <!-- Danger zone -->
        <div class="bg-[#1e2038] rounded-2xl p-5 border border-red-900/30">
          <h2 class="text-sm font-bold text-red-400 mb-2">Zona de perigo</h2>
          <p class="text-xs text-slate-400 mb-3">
            Desativar a comunidade marca ela como removida. O conteúdo é preservado no banco de dados.
          </p>
          <button
            type="button"
            :disabled="actions.acting.value"
            @click="onDelete"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-700/20 hover:bg-red-700/30 text-red-300 border border-red-700/40 disabled:opacity-50 transition-colors"
          >
            Desativar comunidade
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
