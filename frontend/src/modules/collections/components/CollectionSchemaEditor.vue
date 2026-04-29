<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Lock, Trash2, Plus, X, Loader2, AlertCircle, Sparkles } from 'lucide-vue-next'
import { useCollectionsStore } from '../composables/useCollections'
import { createFieldDefinition, listFieldDefinitions } from '../services/collectionsService'
import { CURRENCIES, type CurrencyCode } from '../utils/money'
import AppModal from '@/shared/ui/AppModal.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import type { Collection, FieldType } from '../types'

const props = defineProps<{
  collection: Collection
}>()

const emit = defineEmits<{ close: [] }>()

const store = useCollectionsStore()

const fieldSchema = computed(() => {
  const entries = props.collection.fieldSchema ?? []
  return [...entries].sort((a, b) => a.displayOrder - b.displayOrder)
})

// New field form
const showNewForm = ref(false)
const newName = ref('')
const newType = ref<FieldType>('text')
const newSelectOptionsRaw = ref('') // string separada por vírgula (apenas tipo select)
const newCurrency = ref<CurrencyCode>('BRL')
const newRequired = ref(false)
const creating = ref(false)
const newError = ref('')

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: 'text',    label: 'Texto' },
  { value: 'number',  label: 'Número' },
  { value: 'date',    label: 'Data' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'select',  label: 'Lista' },
  { value: 'money',   label: 'Dinheiro' },
]

function resetNewForm() {
  newName.value = ''
  newType.value = 'text'
  newSelectOptionsRaw.value = ''
  newCurrency.value = 'BRL'
  newRequired.value = false
  newError.value = ''
}

// Limpa erro quando troca de tipo
watch(newType, () => { newError.value = '' })

async function submitNew() {
  newError.value = ''
  const name = newName.value.trim()
  if (!name) {
    newError.value = 'O nome é obrigatório'
    return
  }

  let selectOptions: string[] | undefined
  if (newType.value === 'select') {
    const opts = newSelectOptionsRaw.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (opts.length === 0) {
      newError.value = 'Adicione ao menos uma opção (separadas por vírgula)'
      return
    }
    selectOptions = opts
  } else if (newType.value === 'money') {
    selectOptions = [newCurrency.value]
  }

  creating.value = true
  try {
    let defId: string

    try {
      // 1a. tenta criar a definição na biblioteca do usuário (backend gera o fieldKey via slug)
      const def = await createFieldDefinition({
        name,
        fieldType: newType.value,
        selectOptions,
      })
      defId = def.id
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; message?: string } } }
      // 1b. se já existe definição com mesmo nome, reaproveita
      if (err.response?.status === 409) {
        const allDefs = await listFieldDefinitions()
        const match = allDefs.find((d) =>
          !d.isSystem
          && d.name.toLowerCase() === name.toLowerCase()
          && d.fieldType === newType.value
        )
        if (!match) {
          newError.value = 'Você já tem um campo com esse nome mas de outro tipo. Use um nome diferente.'
          return
        }
        defId = match.id
      } else {
        newError.value = err.response?.data?.error ?? err.response?.data?.message ?? 'Erro ao criar campo'
        return
      }
    }

    // 2. anexa à coleção atual
    const entry = await store.attachSchemaEntry(props.collection.id, defId, newRequired.value)
    if (!entry) {
      newError.value = store.error ?? 'Erro ao anexar campo'
      return
    }

    // 3. limpa o form
    resetNewForm()
    showNewForm.value = false
  } finally {
    creating.value = false
  }
}

const togglingRequired = ref<string | null>(null)
async function toggleRequired(entryId: string, current: boolean) {
  togglingRequired.value = entryId
  await store.updateSchemaEntry(props.collection.id, entryId, { isRequired: !current })
  togglingRequired.value = null
}

const removingId = ref<string | null>(null)
const removeTarget = ref<{ entryId: string; fieldName: string } | null>(null)

function askRemoveEntry(entryId: string, fieldName: string) {
  removeTarget.value = { entryId, fieldName }
}

async function confirmRemoveEntry() {
  const target = removeTarget.value
  if (!target) return
  removingId.value = target.entryId
  await store.detachSchemaEntry(props.collection.id, target.entryId)
  removingId.value = null
  removeTarget.value = null
}

function typeLabel(t: FieldType): string {
  return fieldTypes.find((ft) => ft.value === t)?.label ?? t
}
</script>

<template>
  <div class="p-5 max-h-[85vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-1">
      <h2 class="text-[16px] font-bold text-[#e2e8f0]">Campos da coleção</h2>
      <button
        class="w-7 h-7 rounded-full hover:bg-[#252640] flex items-center justify-center text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>
    <p class="text-[12px] text-[#94a3b8] mb-5">
      Campos padrão são automáticos pelo tipo da coleção. Você pode adicionar quantos campos extras quiser.
    </p>

    <!-- Lista de entries -->
    <div class="space-y-2">
      <div
        v-for="entry in fieldSchema"
        :key="entry.id"
        class="flex items-center gap-3 rounded-xl bg-[#1e2038] border border-[#252640] px-3 py-2.5"
      >
        <!-- Lock icon for system fields -->
        <div
          class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          :class="entry.fieldDefinition.isSystem
            ? 'bg-[#252640] text-[#94a3b8]'
            : 'bg-[#f59e0b]/15 text-[#f59e0b]'"
        >
          <Lock v-if="entry.fieldDefinition.isSystem" :size="13" />
          <Sparkles v-else :size="13" />
        </div>

        <!-- Name + type -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <p class="truncate text-[13px] font-semibold text-[#e2e8f0] leading-tight">
              {{ entry.fieldDefinition.name }}
            </p>
            <span
              v-if="entry.fieldDefinition.isSystem"
              class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#252640] text-[#94a3b8] font-bold"
            >
              Padrão
            </span>
          </div>
          <p class="text-[11px] text-[#94a3b8] mt-0.5">
            {{ typeLabel(entry.fieldDefinition.fieldType) }}
            <span v-if="entry.fieldDefinition.fieldType === 'select' && entry.fieldDefinition.selectOptions?.length">
              · {{ entry.fieldDefinition.selectOptions.length }} opções
            </span>
            <span v-else-if="entry.fieldDefinition.fieldType === 'money' && entry.fieldDefinition.selectOptions?.[0]">
              · {{ entry.fieldDefinition.selectOptions[0] }}
            </span>
          </p>
        </div>

        <!-- Required toggle -->
        <button
          type="button"
          :disabled="togglingRequired === entry.id"
          :class="[
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
            entry.isRequired
              ? 'bg-[#f59e0b]/15 text-[#f59e0b]'
              : 'bg-[#252640] text-[#94a3b8] hover:bg-[#2e3050]',
          ]"
          :title="entry.isRequired ? 'Obrigatório — clique para tornar opcional' : 'Opcional — clique para tornar obrigatório'"
          @click="toggleRequired(entry.id, entry.isRequired)"
        >
          <Loader2 v-if="togglingRequired === entry.id" :size="11" class="animate-spin" />
          <span v-else-if="entry.isRequired">●</span>
          <span v-else>○</span>
          {{ entry.isRequired ? 'Obrigatório' : 'Opcional' }}
        </button>

        <!-- Delete (only for non-system) -->
        <button
          v-if="!entry.fieldDefinition.isSystem"
          type="button"
          :disabled="removingId === entry.id"
          class="flex-shrink-0 w-8 h-8 rounded-lg bg-[#252640] text-[#94a3b8] hover:bg-[#ef4444]/20 hover:text-[#ef4444] flex items-center justify-center transition-colors disabled:opacity-50"
          title="Remover campo"
          @click="askRemoveEntry(entry.id, entry.fieldDefinition.name)"
        >
          <Loader2 v-if="removingId === entry.id" :size="13" class="animate-spin" />
          <Trash2 v-else :size="13" />
        </button>
      </div>

      <!-- Empty state -->
      <div
        v-if="fieldSchema.length === 0"
        class="rounded-xl bg-[#1e2038] border border-dashed border-[#252640] px-4 py-8 text-center"
      >
        <p class="text-[12px] text-[#94a3b8]">Nenhum campo definido ainda</p>
      </div>
    </div>

    <!-- Add new field — toggle button + inline form -->
    <div class="mt-5 pt-5 border-t border-[#252640]">
      <button
        v-if="!showNewForm"
        type="button"
        class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#252640] hover:bg-[#2e3050] text-[#94a3b8] hover:text-[#f59e0b] text-[13px] font-semibold transition-colors"
        @click="showNewForm = true; resetNewForm()"
      >
        <Plus :size="15" :stroke-width="2.5" />
        Adicionar novo campo
      </button>

      <form
        v-else
        class="space-y-3"
        @submit.prevent="submitNew"
      >
        <div class="flex items-center justify-between">
          <p class="text-[12px] font-semibold text-[#f59e0b] uppercase tracking-wider">
            Novo campo customizado
          </p>
          <button
            type="button"
            class="text-[11px] text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
            @click="showNewForm = false; resetNewForm()"
          >
            Cancelar
          </button>
        </div>

        <!-- Name -->
        <div>
          <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5">
            Nome do campo <span class="text-[#f59e0b]">*</span>
          </label>
          <input
            v-model="newName"
            type="text"
            placeholder="Ex: Tempo de jogo, Localização..."
            maxlength="100"
            class="w-full bg-[#252640] border border-[#252640] focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-md outline-none transition-colors"
          />
        </div>

        <!-- Type -->
        <div>
          <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5">Tipo</label>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            <button
              v-for="ft in fieldTypes"
              :key="ft.value"
              type="button"
              :class="[
                'py-2 rounded-md text-[11px] font-medium transition-colors',
                newType === ft.value
                  ? 'bg-[#f59e0b] text-black'
                  : 'bg-[#252640] text-[#94a3b8] hover:bg-[#2e3050]',
              ]"
              @click="newType = ft.value"
            >
              {{ ft.label }}
            </button>
          </div>
        </div>

        <!-- Select options (only for select) -->
        <div v-if="newType === 'select'">
          <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5">
            Opções <span class="text-[#f59e0b]">*</span>
            <span class="text-[#475569] font-normal normal-case">(separadas por vírgula)</span>
          </label>
          <input
            v-model="newSelectOptionsRaw"
            type="text"
            placeholder="Mint, Near Mint, Played..."
            class="w-full bg-[#252640] border border-[#252640] focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-md outline-none transition-colors"
          />
        </div>

        <!-- Currency picker (only for money) -->
        <div v-else-if="newType === 'money'">
          <label class="block text-[11px] font-medium text-[#94a3b8] mb-1.5">
            Moeda <span class="text-[#f59e0b]">*</span>
          </label>
          <select
            v-model="newCurrency"
            class="w-full bg-[#252640] border border-[#252640] focus:border-[#f59e0b] text-[#e2e8f0] text-[13px] px-3 py-2 rounded-md outline-none transition-colors cursor-pointer"
          >
            <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">
              {{ c.symbol }} — {{ c.label }} ({{ c.code }})
            </option>
          </select>
        </div>

        <!-- Required -->
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="newRequired"
            type="checkbox"
            class="w-4 h-4 rounded accent-[#f59e0b]"
          />
          <span class="text-[12px] text-[#cbd5e1]">Tornar obrigatório</span>
        </label>

        <!-- Error -->
        <div v-if="newError" class="flex items-start gap-2 px-3 py-2 rounded-md bg-[#ef4444]/10 border border-[#ef4444]/20">
          <AlertCircle :size="13" class="text-[#ef4444] mt-0.5 flex-shrink-0" />
          <p class="text-[11px] text-[#ef4444]">{{ newError }}</p>
        </div>

        <!-- Submit -->
        <button
          type="submit"
          :disabled="creating"
          class="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 text-black text-[13px] font-semibold transition-colors active:scale-95"
        >
          <Loader2 v-if="creating" :size="14" class="animate-spin" />
          {{ creating ? 'Adicionando...' : 'Adicionar campo' }}
        </button>
      </form>
    </div>
  </div>

  <AppConfirmDialog
    :open="!!removeTarget"
    title="Remover campo"
    confirm-label="Remover"
    :loading="removingId !== null"
    @cancel="removeTarget = null"
    @confirm="confirmRemoveEntry"
  >
    <p>
      Remover o campo
      <strong class="text-(--color-text-primary)">"{{ removeTarget?.fieldName }}"</strong>
      desta coleção?
      Os valores já preenchidos nos itens serão preservados, mas o campo deixa de aparecer.
    </p>
  </AppConfirmDialog>
</template>
