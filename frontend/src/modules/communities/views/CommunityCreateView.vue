<script setup lang="ts">
import { useRouter } from 'vue-router'
import CommunityForm from '../components/CommunityForm.vue'
import { useCommunityActions } from '../composables/useCommunityActions'
import type { CreateCommunityPayload } from '../types'

const router = useRouter()
const actions = useCommunityActions()

async function onSubmit(payload: CreateCommunityPayload, cover: File | null, icon: File | null) {
  if (!cover || !icon) return
  try {
    await actions.create(payload, cover, icon)
  } catch {
    // error surfaced via actions.error.value bound to CommunityForm :error prop
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="community-create-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-2xl mx-auto px-4">
        <h1 class="text-xl font-bold text-slate-100">Nova comunidade</h1>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 py-6">
      <div class="bg-[#1e2038] rounded-2xl p-5 border border-[#252640]">
        <CommunityForm
          :loading="actions.acting.value"
          :error="actions.error.value"
          @submit="onSubmit"
          @cancel="router.push('/comunidades')"
        />
      </div>
    </div>
  </div>
</template>
