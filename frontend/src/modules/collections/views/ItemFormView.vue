<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, Camera, Loader2, Trash2, Save,
} from 'lucide-vue-next'
import { useItemsStore } from '../composables/useItems'
import { useCollectionsStore } from '../composables/useCollections'
import { findCurrency } from '../utils/money'
import type { CollectionSchemaEntry } from '../types'
import IgdbGameSearch from '../components/IgdbGameSearch.vue'
import type { IgdbGame } from '../services/igdbService'

const route = useRoute()
const router = useRouter()

const itemsStore = useItemsStore()
const collectionsStore = useCollectionsStore()

const collectionId = computed(() => route.params.id as string)
const itemId = computed(() => route.params.itemId as string | undefined)
const isEditMode = computed(() => !!itemId.value)
const fromItems = computed(() => route.query.from === 'items')

const collection = computed(() => collectionsStore.current)
const item = computed(() => itemsStore.current)

// Schema da coleção (esconde campos com isHidden — ex: steam_appid)
const fieldSchema = computed<CollectionSchemaEntry[]>(() => {
  if (!collection.value || collection.value.id !== collectionId.value) return []
  return [...(collection.value.fieldSchema ?? [])]
    .filter(e => !e.fieldDefinition.isHidden)
    .sort((a, b) => a.displayOrder - b.displayOrder)
})

// Item de origem para preencher o form — só vale em modo edição com o id casando.
// Em modo criar, ignora o `itemsStore.current` (que pode estar com lixo de uma edição anterior).
const sourceItem = computed(() => {
  if (!isEditMode.value) return null
  if (item.value && item.value.id === itemId.value) return item.value
  return null
})

// Form state
const name = ref('')
const comment = ref('')
const rating = ref<number>(0)
type FieldValue = string | number | boolean | null
const fieldValues = ref<Record<string, FieldValue>>({})

// Inicializa do item carregado / dos defaults
watchEffect(() => {
  // Aguarda o item ser carregado em modo edição
  if (isEditMode.value && !sourceItem.value) return

  name.value = sourceItem.value?.name ?? ''
  comment.value = sourceItem.value?.comment ?? ''
  rating.value = sourceItem.value?.rating ?? 0

  const next: Record<string, FieldValue> = {}
  for (const entry of fieldSchema.value) {
    const key = entry.fieldDefinition.fieldKey
    const ft = entry.fieldDefinition.fieldType
    const existing = sourceItem.value?.fields?.[key]
    if (existing !== undefined && existing !== null) {
      next[key] = existing as FieldValue
    } else {
      next[key] = ft === 'boolean' ? false : ''
    }
  }
  fieldValues.value = next
})

// Cover
const coverPreviewUrl = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

watchEffect(() => {
  if (selectedFile.value) return
  if (!isEditMode.value) {
    coverPreviewUrl.value = null
    return
  }
  if (sourceItem.value) {
    coverPreviewUrl.value = sourceItem.value.coverUrl ?? null
  }
})

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  selectedFile.value = file
  if (coverPreviewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreviewUrl.value)
  coverPreviewUrl.value = URL.createObjectURL(file)
}

function removeCoverPreview() {
  if (coverPreviewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreviewUrl.value)
  coverPreviewUrl.value = null
  selectedFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

onUnmounted(() => {
  if (coverPreviewUrl.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreviewUrl.value)
})

function setRating(value: number) {
  rating.value = rating.value === value ? 0 : value
}

const submitting = ref(false)
const fieldError = ref('')

function buildFieldsPayload(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const entry of fieldSchema.value) {
    const key = entry.fieldDefinition.fieldKey
    const ft = entry.fieldDefinition.fieldType
    const raw = fieldValues.value[key]

    if (ft === 'boolean') {
      out[key] = !!raw
      continue
    }

    if (raw === '' || raw === null || raw === undefined) continue

    if (ft === 'number' || ft === 'money') {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isNaN(n)) out[key] = n
    } else {
      out[key] = raw
    }
  }
  return out
}

async function submit() {
  if (!name.value.trim()) {
    fieldError.value = 'O nome é obrigatório'
    return
  }
  fieldError.value = ''
  submitting.value = true

  const fields = buildFieldsPayload()

  try {
    if (isEditMode.value && sourceItem.value) {
      const editingId = sourceItem.value.id
      const ok = await itemsStore.updateItem(collectionId.value, editingId, {
        name: name.value.trim(),
        comment: comment.value.trim() || null,
        rating: rating.value || null,
        fields,
      })
      if (ok && selectedFile.value) {
        await itemsStore.uploadItemCover(collectionId.value, editingId, selectedFile.value)
      }
      if (!itemsStore.error) {
        const q = fromItems.value ? '?from=items' : ''
        router.replace(`/collections/${collectionId.value}/items/${editingId}${q}`)
      }
    } else {
      const created = await itemsStore.createItem(collectionId.value, {
        name: name.value.trim(),
        comment: comment.value.trim() || undefined,
        rating: rating.value || undefined,
        fields,
      })
      if (created && selectedFile.value) {
        await itemsStore.uploadItemCover(collectionId.value, created.id, selectedFile.value)
      }
      if (created && !itemsStore.error) {
        const q = fromItems.value ? '?from=items' : ''
        router.replace(`/collections/${collectionId.value}/items/${created.id}${q}`)
      }
    }
  } finally {
    submitting.value = false
  }
}

function cancel() {
  if (isEditMode.value && sourceItem.value) {
    const q = fromItems.value ? '?from=items' : ''
    router.replace(`/collections/${collectionId.value}/items/${sourceItem.value.id}${q}`)
  } else if (fromItems.value) {
    router.replace('/collections?tab=items')
  } else {
    router.replace(`/collections/${collectionId.value}`)
  }
}

const inputClass = 'w-full bg-[#1e2038] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors'

onMounted(async () => {
  if (!collection.value || collection.value.id !== collectionId.value) {
    await collectionsStore.fetchCollection(collectionId.value)
  }
  if (isEditMode.value && itemId.value) {
    await itemsStore.fetchItem(collectionId.value, itemId.value)
  }
})

const loading = computed(() => {
  if (!collection.value || collection.value.id !== collectionId.value) return true
  if (isEditMode.value) return !sourceItem.value
  return false
})

const pageTitle = computed(() => isEditMode.value ? 'Editar item' : 'Novo item')
const collectionName = computed(() => collection.value?.name ?? 'Coleção')

const isGamesCollection = computed(() => collection.value?.type === 'games')

async function applyIgdbGame(game: IgdbGame) {
  name.value = game.name
  if (game.coverUrl) {
    coverPreviewUrl.value = game.coverUrl
    try {
      const res = await fetch(game.coverUrl)
      const blob = await res.blob()
      const fileName = game.coverUrl.split('/').pop() ?? 'cover.jpg'
      selectedFile.value = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
      coverPreviewUrl.value = URL.createObjectURL(selectedFile.value)
    } catch {
      selectedFile.value = null
    }
  }
  for (const entry of fieldSchema.value) {
    const key = entry.fieldDefinition.fieldKey
    if (key === 'genre' && game.genre) fieldValues.value[key] = game.genre
    else if (key === 'platform' && game.platform) fieldValues.value[key] = game.platform
    else if (key === 'developer' && game.developer) fieldValues.value[key] = game.developer
    else if (key === 'release_year' && game.releaseYear) fieldValues.value[key] = game.releaseYear
    else if (key === 'igdb_id' && game.id) fieldValues.value[key] = game.id
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <!-- Top bar -->
    <div class="sticky top-0 z-10 bg-[#0f0f1a]/85 backdrop-blur-md border-b border-[#1a1b2e]">
      <div class="max-w-3xl mx-auto h-16 px-4 md:px-8 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#1e2038] text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
            title="Voltar"
            @click="cancel"
          >
            <ArrowLeft :size="18" />
          </button>
          <div class="min-w-0">
            <h1 class="text-[16px] font-bold text-[#e2e8f0] leading-tight truncate">{{ pageTitle }}</h1>
            <p class="text-[11px] text-[#94a3b8] truncate">{{ collectionName }}</p>
          </div>
        </div>
        <button
          type="button"
          form="item-form"
          :disabled="submitting || loading"
          class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-black text-[13px] font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
          @click="submit"
        >
          <Loader2 v-if="submitting" :size="14" class="animate-spin" />
          <Save v-else :size="14" :stroke-width="2.5" />
          {{ submitting ? 'Salvando...' : isEditMode ? 'Salvar' : 'Adicionar' }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-4">
      <div class="h-32 bg-[#1e2038] rounded-xl animate-pulse" />
      <div class="h-12 bg-[#1e2038] rounded-xl animate-pulse" />
      <div class="h-24 bg-[#1e2038] rounded-xl animate-pulse" />
    </div>

    <!-- Form -->
    <form v-else id="item-form" class="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-5" @submit.prevent="submit">
      <!-- Cover -->
      <section class="rounded-xl bg-[#1a1b2e] border border-[#252640] p-4">
        <p class="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Capa</p>
        <div class="flex gap-4 items-start">
          <div
            class="relative flex-shrink-0 w-[88px] h-[120px] bg-[#252640] rounded-lg overflow-hidden border border-[#333355] cursor-pointer hover:border-[#f59e0b]/50 transition-colors group"
            @click="openFilePicker"
          >
            <img
              v-if="coverPreviewUrl"
              :src="coverPreviewUrl"
              alt="Preview"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1.5 text-[#475569]">
              <Camera :size="24" />
              <span class="text-[9px] uppercase tracking-wider font-semibold">Capa</span>
            </div>
            <button
              v-if="coverPreviewUrl"
              type="button"
              class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remover"
              @click.stop="removeCoverPreview"
            >
              <Trash2 :size="12" />
            </button>
          </div>
          <div class="flex-1 pt-1">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileSelected"
            />
            <button
              type="button"
              class="text-[12px] text-[#f59e0b] hover:underline font-medium"
              @click="openFilePicker"
            >
              {{ coverPreviewUrl ? 'Trocar imagem' : 'Escolher imagem' }}
            </button>
            <p class="text-[11px] text-[#94a3b8] mt-1">JPEG ou PNG, máx 5MB. A imagem completa é preservada.</p>
          </div>
        </div>
      </section>

      <!-- Básico -->
      <section class="rounded-xl bg-[#1a1b2e] border border-[#252640] p-4 space-y-4">
        <p class="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">Informações básicas</p>

        <!-- IGDB game search (games only) -->
        <div v-if="isGamesCollection && !isEditMode">
          <label class="block text-[11px] font-medium text-[#cbd5e1] mb-1.5">Buscar na IGDB</label>
          <IgdbGameSearch @select="applyIgdbGame" />
          <p class="text-[11px] text-[#475569] mt-1">Preenche automaticamente nome, capa e detalhes.</p>
        </div>

        <!-- Name -->
        <div>
          <label class="block text-[11px] font-medium text-[#cbd5e1] mb-1.5">
            Nome <span class="text-[#f59e0b]">*</span>
          </label>
          <input
            v-model="name"
            type="text"
            placeholder="Ex: The Last of Us Part II"
            maxlength="200"
            :class="inputClass"
          />
          <p v-if="fieldError" class="text-[11px] text-red-400 mt-1">{{ fieldError }}</p>
        </div>

        <!-- Rating -->
        <div>
          <label class="block text-[11px] font-medium text-[#cbd5e1] mb-1.5">Avaliação</label>
          <div class="flex gap-1.5 items-center">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              class="text-[28px] leading-none transition-transform hover:scale-110 focus:outline-none"
              :class="n <= rating ? 'text-[#f59e0b]' : 'text-[#475569]'"
              @click="setRating(n)"
            >
              ★
            </button>
            <span class="text-[11px] text-[#94a3b8] ml-2">
              {{ rating === 0 ? 'Sem nota' : `${rating}/5` }}
            </span>
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-[11px] font-medium text-[#cbd5e1] mb-1.5">Notas</label>
          <textarea
            v-model="comment"
            placeholder="Impressões, resenha, lembrete..."
            rows="4"
            maxlength="2000"
            :class="[inputClass, 'resize-none']"
          />
        </div>

      </section>

      <!-- Campos dinâmicos -->
      <section v-if="fieldSchema.length" class="rounded-xl bg-[#1a1b2e] border border-[#252640] p-4 space-y-4">
        <p class="text-[10px] font-bold text-[#f59e0b] uppercase tracking-wider">Detalhes da coleção</p>

        <div
          v-for="entry in fieldSchema"
          :key="entry.id"
        >
          <label class="block text-[11px] font-medium text-[#cbd5e1] mb-1.5">
            {{ entry.fieldDefinition.name }}
            <span v-if="entry.isRequired" class="text-[#f59e0b]">*</span>
            <span
              v-if="entry.fieldDefinition.fieldType === 'money' && entry.fieldDefinition.selectOptions?.[0]"
              class="text-[10px] text-[#475569] ml-1 font-normal"
            >
              ({{ entry.fieldDefinition.selectOptions[0] }})
            </span>
          </label>

          <input
            v-if="entry.fieldDefinition.fieldType === 'text'"
            v-model="fieldValues[entry.fieldDefinition.fieldKey]"
            type="text"
            :class="inputClass"
          />

          <input
            v-else-if="entry.fieldDefinition.fieldType === 'number'"
            v-model.number="fieldValues[entry.fieldDefinition.fieldKey]"
            type="number"
            :class="inputClass"
          />

          <div
            v-else-if="entry.fieldDefinition.fieldType === 'money'"
            class="relative"
          >
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#94a3b8] pointer-events-none select-none">
              {{ findCurrency(entry.fieldDefinition.selectOptions?.[0]).symbol }}
            </span>
            <input
              v-model.number="fieldValues[entry.fieldDefinition.fieldKey]"
              type="number"
              step="0.01"
              placeholder="0,00"
              :class="[inputClass, 'pl-11']"
            />
          </div>

          <input
            v-else-if="entry.fieldDefinition.fieldType === 'date'"
            v-model="fieldValues[entry.fieldDefinition.fieldKey]"
            type="date"
            :class="inputClass"
          />

          <button
            v-else-if="entry.fieldDefinition.fieldType === 'boolean'"
            type="button"
            :class="[
              'relative w-12 h-6 rounded-full transition-colors duration-200',
              fieldValues[entry.fieldDefinition.fieldKey] ? 'bg-[#22c55e]' : 'bg-[#252640]',
            ]"
            @click="fieldValues[entry.fieldDefinition.fieldKey] = !fieldValues[entry.fieldDefinition.fieldKey]"
          >
            <span
              :class="[
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                fieldValues[entry.fieldDefinition.fieldKey] ? 'translate-x-6' : 'translate-x-0',
              ]"
            />
          </button>

          <select
            v-else-if="entry.fieldDefinition.fieldType === 'select'"
            v-model="fieldValues[entry.fieldDefinition.fieldKey]"
            :class="[inputClass, 'cursor-pointer']"
          >
            <option value="">Selecione...</option>
            <option
              v-for="opt in entry.fieldDefinition.selectOptions ?? []"
              :key="opt"
              :value="opt"
            >
              {{ opt }}
            </option>
          </select>
        </div>
      </section>

      <!-- Server error -->
      <p v-if="itemsStore.error" class="text-[12px] text-red-400">{{ itemsStore.error }}</p>

      <!-- Footer actions (mobile) -->
      <div class="flex gap-3 pt-2">
        <button
          type="button"
          class="flex-1 bg-[#1e2038] hover:bg-[#252640] border border-[#252640] text-[#cbd5e1] text-[13px] font-medium py-3 rounded-lg transition-colors"
          @click="cancel"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="submitting"
          class="flex-1 flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-black text-[13px] font-semibold py-3 rounded-lg transition-colors active:scale-95"
        >
          <Loader2 v-if="submitting" :size="14" class="animate-spin" />
          {{ submitting ? 'Salvando...' : isEditMode ? 'Salvar alterações' : 'Adicionar item' }}
        </button>
      </div>
    </form>
  </div>
</template>
