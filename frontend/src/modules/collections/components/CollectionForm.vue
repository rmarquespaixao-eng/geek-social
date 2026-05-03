<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCollectionsStore } from '../composables/useCollections'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'
import { useCollectionTypes } from '../composables/useCollectionTypes'
import type { Collection, CollectionType } from '../types'

const props = defineProps<{
  collection?: Collection   // se fornecido, modo edição
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useCollectionsStore()
const featureFlags = useFeatureFlagsStore()
const { types: collectionTypes } = useCollectionTypes()

const hasSocialFeatures = computed(() =>
  featureFlags.isEnabled('module_feed') ||
  featureFlags.isEnabled('module_friends') ||
  featureFlags.isEnabled('module_communities'),
)

const isEditMode = computed(() => !!props.collection)

const name = ref(props.collection?.name ?? '')
const description = ref(props.collection?.description ?? '')
const type = ref<CollectionType>(props.collection?.type ?? 'games')
const isPublic = ref(props.collection?.visibility !== 'private')
const autoShareToFeed = ref(props.collection?.autoShareToFeed ?? false)

const submitting = ref(false)
const fieldError = ref('')

async function submit() {
  if (!name.value.trim()) {
    fieldError.value = 'O nome é obrigatório'
    return
  }
  fieldError.value = ''
  submitting.value = true

  const visibility = hasSocialFeatures.value && isPublic.value ? 'public' : 'private'
  const shareToFeed = hasSocialFeatures.value && autoShareToFeed.value

  if (isEditMode.value && props.collection) {
    await store.updateCollection(props.collection.id, {
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      visibility,
      autoShareToFeed: shareToFeed,
    })
  } else {
    await store.createCollection({
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      type: type.value,
      visibility,
      autoShareToFeed: shareToFeed,
    })
  }

  submitting.value = false
  if (!store.error) emit('close')
}
</script>

<template>
  <div class="p-5">
    <!-- Modal header -->
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-[16px] font-bold text-[#e2e8f0]">
        {{ isEditMode ? 'Editar coleção' : 'Nova coleção' }}
      </h2>
      <button
        class="w-7 h-7 rounded-full hover:bg-[#252640] flex items-center justify-center text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <!-- Name -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Nome *
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="Ex: Meus Jogos do PS5"
          maxlength="100"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors"
        />
        <p v-if="fieldError" class="text-[11px] text-red-400 mt-1">{{ fieldError }}</p>
      </div>

      <!-- Description -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Descrição
        </label>
        <textarea
          v-model="description"
          placeholder="Descrição opcional..."
          rows="2"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors resize-none"
        />
      </div>

      <!-- Type (only on create) -->
      <div v-if="!isEditMode">
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Tipo
        </label>
        <select
          v-model="type"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors cursor-pointer"
        >
          <option v-for="t in collectionTypes" :key="t.key" :value="t.key">
            {{ t.icon ? `${t.icon} ` : '' }}{{ t.name ?? t.key }}
          </option>
        </select>
      </div>

      <!-- Public/private toggle — oculto quando rede social desabilitada -->
      <div v-if="hasSocialFeatures" class="flex items-center justify-between py-1">
        <div>
          <p class="text-[13px] font-medium text-[#e2e8f0]">Coleção pública</p>
          <p class="text-[11px] text-[#94a3b8]">Visível para outros usuários</p>
        </div>
        <button
          type="button"
          :class="[
            'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none',
            isPublic ? 'bg-[#22c55e]' : 'bg-[#252640]',
          ]"
          @click="isPublic = !isPublic"
        >
          <span
            :class="[
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
              isPublic ? 'translate-x-5' : 'translate-x-0',
            ]"
          />
        </button>
      </div>

      <!-- Auto-share to feed toggle — oculto quando rede social desabilitada -->
      <div v-if="hasSocialFeatures" class="flex items-center justify-between py-1">
        <div class="pr-3">
          <p class="text-[13px] font-medium text-[#e2e8f0]">Publicar novos itens no feed</p>
          <p class="text-[11px] text-[#94a3b8]">
            Cada item adicionado vira uma postagem para descoberta no feed.
            Respeita a visibilidade da coleção.
          </p>
        </div>
        <button
          type="button"
          :class="[
            'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0',
            autoShareToFeed ? 'bg-[#f59e0b]' : 'bg-[#252640]',
          ]"
          @click="autoShareToFeed = !autoShareToFeed"
        >
          <span
            :class="[
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
              autoShareToFeed ? 'translate-x-5' : 'translate-x-0',
            ]"
          />
        </button>
      </div>

      <!-- Server error -->
      <p v-if="store.error" class="text-[12px] text-red-400">{{ store.error }}</p>

      <!-- Actions -->
      <div class="flex gap-3 pt-1">
        <button
          type="button"
          class="flex-1 bg-[#252640] hover:bg-[#2d2f52] text-[#94a3b8] text-[13px] font-medium py-2 rounded-[6px] transition-colors"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="submitting"
          class="flex-1 bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-black text-[13px] font-semibold py-2 rounded-[6px] transition-colors"
        >
          {{ submitting ? 'Salvando...' : isEditMode ? 'Salvar' : 'Criar' }}
        </button>
      </div>
    </form>
  </div>
</template>
