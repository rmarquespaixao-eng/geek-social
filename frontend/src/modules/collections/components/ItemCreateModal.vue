<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loader2, ChevronDown } from 'lucide-vue-next'
import { useCollectionsStore } from '../composables/useCollections'
import { createItem } from '../services/itemsService'
import { extractApiError } from '../composables/extractApiError'
import { findCurrency } from '../utils/money'
import type { Collection, CollectionSchemaEntry } from '../types'

const props = defineProps<{
  collections: Collection[]
}>()

const emit = defineEmits<{
  close: []
  created: []
}>()

const collectionsStore = useCollectionsStore()

const selectedCollectionId = ref<string>(props.collections[0]?.id ?? '')
const loadingSchema = ref(false)

const selectedCollectionWithSchema = computed(() =>
  collectionsStore.current?.id === selectedCollectionId.value
    ? collectionsStore.current
    : null,
)

const fieldSchema = computed<CollectionSchemaEntry[]>(() => {
  const col = selectedCollectionWithSchema.value
  if (!col) return []
  return [...(col.fieldSchema ?? [])]
    .filter(e => !e.fieldDefinition.isHidden)
    .sort((a, b) => a.displayOrder - b.displayOrder)
})

watch(selectedCollectionId, async (id) => {
  if (!id) return
  if (collectionsStore.current?.id === id) { resetFields(); return }
  loadingSchema.value = true
  await collectionsStore.fetchCollection(id)
  loadingSchema.value = false
  resetFields()
}, { immediate: true })

const name = ref('')
const comment = ref('')
const rating = ref(0)
type FieldValue = string | number | boolean | null
const fieldValues = ref<Record<string, FieldValue>>({})
const submitting = ref(false)
const error = ref<string | null>(null)

function resetFields() {
  fieldValues.value = {}
  for (const entry of fieldSchema.value) {
    const key = entry.fieldDefinition.fieldKey
    fieldValues.value[key] = entry.fieldDefinition.fieldType === 'boolean' ? false : ''
  }
}

function setRating(n: number) {
  rating.value = rating.value === n ? 0 : n
}

function buildFields(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const entry of fieldSchema.value) {
    const key = entry.fieldDefinition.fieldKey
    const ft = entry.fieldDefinition.fieldType
    const raw = fieldValues.value[key]
    if (ft === 'boolean') { out[key] = !!raw; continue }
    if (raw === '' || raw === null || raw === undefined) continue
    if (ft === 'number' || ft === 'money') {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!isNaN(n)) out[key] = n
    } else {
      out[key] = raw
    }
  }
  return out
}

async function submit() {
  if (!name.value.trim()) { error.value = 'O nome é obrigatório'; return }
  if (!selectedCollectionId.value) { error.value = 'Selecione uma coleção'; return }
  error.value = null
  submitting.value = true
  try {
    await createItem(selectedCollectionId.value, {
      name: name.value.trim(),
      comment: comment.value.trim() || undefined,
      rating: rating.value || undefined,
      fields: buildFields(),
    })
    emit('created')
  } catch (e) {
    error.value = extractApiError(e, 'Erro ao criar item')
  } finally {
    submitting.value = false
  }
}

const inputClass = 'w-full bg-[#0f0f1a] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors'
</script>

<template>
  <div class="bg-[#1a1b2e] rounded-2xl border border-[#252640] w-full max-w-lg mx-auto flex flex-col max-h-[90vh]">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-[#252640] shrink-0">
      <h2 class="text-[15px] font-bold text-[#e2e8f0]">Novo item</h2>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-lg text-[#475569] hover:text-[#e2e8f0] hover:bg-[#252640] transition-colors text-lg leading-none"
        @click="emit('close')"
      >
        ×
      </button>
    </div>

    <!-- Body scrollável -->
    <div class="overflow-y-auto flex-1 px-5 py-4 space-y-4">

      <!-- Sem coleções -->
      <div v-if="collections.length === 0" class="py-6 text-center space-y-3">
        <p class="text-[#94a3b8] text-[13px]">Você ainda não tem nenhuma coleção.</p>
        <p class="text-[#475569] text-[12px]">Crie uma coleção primeiro para poder adicionar itens.</p>
      </div>

      <template v-else>

      <!-- Picker de coleção -->
      <div v-if="collections.length > 1">
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5 uppercase tracking-wider">Coleção</label>
        <div class="relative">
          <select
            v-model="selectedCollectionId"
            :class="[inputClass, 'cursor-pointer appearance-none pr-8']"
          >
            <option v-for="c in collections" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
          <ChevronDown :size="13" class="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
        </div>
      </div>

      <!-- Nome -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5 uppercase tracking-wider">
          Nome <span class="text-[#f59e0b]">*</span>
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="Ex: The Last of Us Part II"
          maxlength="200"
          autofocus
          :class="inputClass"
          @keydown.enter.prevent="submit"
        />
        <p v-if="error && !name.trim()" class="text-[11px] text-red-400 mt-1">{{ error }}</p>
      </div>

      <!-- Rating -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5 uppercase tracking-wider">Avaliação</label>
        <div class="flex gap-1 items-center">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="text-[26px] leading-none transition-transform hover:scale-110 focus:outline-none"
            :class="n <= rating ? 'text-[#f59e0b]' : 'text-[#2e3050]'"
            @click="setRating(n)"
          >★</button>
          <span class="text-[11px] text-[#475569] ml-2">{{ rating === 0 ? 'Sem nota' : `${rating}/5` }}</span>
        </div>
      </div>

      <!-- Campos dinâmicos -->
      <template v-if="loadingSchema">
        <div class="space-y-2">
          <div v-for="n in 3" :key="n" class="h-10 bg-[#252640] rounded-lg animate-pulse" />
        </div>
      </template>

      <template v-else-if="fieldSchema.length">
        <div class="border-t border-[#252640] pt-4 space-y-4">
          <p class="text-[10px] font-bold text-[#f59e0b] uppercase tracking-wider">Detalhes da coleção</p>

          <div v-for="entry in fieldSchema" :key="entry.id">
            <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5">
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
            <div v-else-if="entry.fieldDefinition.fieldType === 'money'" class="relative">
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
            <div v-else-if="entry.fieldDefinition.fieldType === 'select'" class="relative">
              <select
                v-model="fieldValues[entry.fieldDefinition.fieldKey]"
                :class="[inputClass, 'cursor-pointer appearance-none pr-8']"
              >
                <option value="">Selecione...</option>
                <option
                  v-for="opt in entry.fieldDefinition.selectOptions ?? []"
                  :key="opt"
                  :value="opt"
                >{{ opt }}</option>
              </select>
              <ChevronDown :size="13" class="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
            </div>
          </div>
        </div>
      </template>

      <!-- Notas -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5 uppercase tracking-wider">Notas</label>
        <textarea
          v-model="comment"
          placeholder="Impressões, resenha, lembrete..."
          rows="3"
          maxlength="2000"
          :class="[inputClass, 'resize-none']"
        />
      </div>

      <p v-if="error && name.trim()" class="text-[12px] text-red-400">{{ error }}</p>

      </template><!-- /v-else (tem coleções) -->
    </div>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-[#252640] flex gap-3 shrink-0">
      <button
        type="button"
        :class="collections.length === 0 ? 'flex-1' : 'flex-1'"
        class="bg-[#0f0f1a] hover:bg-[#252640] border border-[#252640] text-[#94a3b8] text-[13px] font-medium py-2.5 rounded-lg transition-colors"
        @click="emit('close')"
      >
        {{ collections.length === 0 ? 'Fechar' : 'Cancelar' }}
      </button>
      <button
        v-if="collections.length > 0"
        type="button"
        :disabled="submitting || loadingSchema"
        class="flex-1 flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-black text-[13px] font-semibold py-2.5 rounded-lg transition-colors active:scale-95"
        @click="submit"
      >
        <Loader2 v-if="submitting" :size="14" class="animate-spin" />
        {{ submitting ? 'Salvando...' : 'Adicionar item' }}
      </button>
    </div>
  </div>
</template>
