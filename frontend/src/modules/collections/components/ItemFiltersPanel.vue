<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { X, ListFilter, Star } from 'lucide-vue-next'
import type {
  CollectionSchemaEntry, FieldDefinition, ItemSort, FieldFilterValue,
} from '../types'

const props = defineProps<{
  open: boolean
  fieldSchema: CollectionSchemaEntry[]
  initialSort: ItemSort
  initialRatingMin: number | null
  initialHasCover: boolean | null
  initialFieldFilters: Record<string, FieldFilterValue>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', payload: {
    sort: ItemSort
    ratingMin: number | null
    hasCover: boolean | null
    fieldFilters: Record<string, FieldFilterValue>
  }): void
}>()

type LocalState = {
  sort: ItemSort
  ratingMin: number | null
  hasCover: boolean | null
  fieldFilters: Record<string, FieldFilterValue>
}

function emptyState(): LocalState {
  return {
    sort: props.initialSort,
    ratingMin: props.initialRatingMin,
    hasCover: props.initialHasCover,
    fieldFilters: deepCloneFilters(props.initialFieldFilters),
  }
}

function deepCloneFilters(src: Record<string, FieldFilterValue>): Record<string, FieldFilterValue> {
  const out: Record<string, FieldFilterValue> = {}
  for (const [k, v] of Object.entries(src)) {
    out[k] = { ...v, equalsAny: v.equalsAny ? [...v.equalsAny] : undefined }
  }
  return out
}

const state = reactive<LocalState>(emptyState())

watch(
  () => props.open,
  (open) => {
    if (open) Object.assign(state, emptyState())
  },
)

const visibleFields = computed(() =>
  [...props.fieldSchema]
    .filter((entry) => !entry.fieldDefinition.isHidden)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((entry) => entry.fieldDefinition),
)

function getFilter(key: string): FieldFilterValue {
  if (!state.fieldFilters[key]) state.fieldFilters[key] = {}
  return state.fieldFilters[key]
}

function setSelectMulti(key: string, value: string) {
  const f = getFilter(key)
  const list = f.equalsAny ?? []
  const idx = list.indexOf(value)
  if (idx === -1) list.push(value)
  else list.splice(idx, 1)
  f.equalsAny = list.length > 0 ? [...list] : undefined
}

function isSelectedSelect(key: string, value: string): boolean {
  return state.fieldFilters[key]?.equalsAny?.includes(value) ?? false
}

function setBoolean(key: string, value: boolean | null) {
  const f = getFilter(key)
  f.boolValue = value
  if (value === null) delete state.fieldFilters[key].boolValue
}

function pickRating(value: number) {
  state.ratingMin = state.ratingMin === value ? null : value
}

function pickHasCover(value: boolean | null) {
  state.hasCover = state.hasCover === value ? null : value
}

function clearAll() {
  state.sort = 'recent'
  state.ratingMin = null
  state.hasCover = null
  state.fieldFilters = {}
}

function applyAndClose() {
  // Limpa filtros vazios antes de emitir
  const cleaned: Record<string, FieldFilterValue> = {}
  for (const [k, v] of Object.entries(state.fieldFilters)) {
    const isEmpty =
      !v.contains &&
      (!v.equalsAny || v.equalsAny.length === 0) &&
      v.boolValue === undefined &&
      (v.gte === undefined || v.gte === null || v.gte === '') &&
      (v.lte === undefined || v.lte === null || v.lte === '')
    if (!isEmpty) cleaned[k] = v
  }
  emit('apply', {
    sort: state.sort,
    ratingMin: state.ratingMin,
    hasCover: state.hasCover,
    fieldFilters: cleaned,
  })
}

function inputClass(): string {
  return 'w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30'
}

function chipClass(active: boolean): string {
  return active
    ? 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-(--color-accent-amber)/20 text-(--color-accent-amber) border border-(--color-accent-amber)/40'
    : 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-(--color-bg-elevated) text-(--color-text-secondary) border border-transparent hover:border-(--color-bg-card) cursor-pointer'
}

function fieldTypeLabel(def: FieldDefinition): string {
  return def.name
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="translate-x-full"
          enter-to-class="translate-x-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="translate-x-0"
          leave-to-class="translate-x-full"
        >
          <div
            v-if="open"
            class="ml-auto w-full max-w-md h-full bg-(--color-bg-surface) shadow-2xl flex flex-col"
          >
            <div class="flex items-center justify-between px-5 py-4 border-b border-(--color-bg-elevated)">
              <h2 class="flex items-center gap-2 text-base font-bold text-(--color-text-primary)">
                <ListFilter :size="16" /> Filtros
              </h2>
              <button
                class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
                @click="emit('close')"
              >
                <X :size="18" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <!-- Sort -->
              <div>
                <label class="block text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider mb-2">
                  Ordenar por
                </label>
                <select v-model="state.sort" :class="inputClass()">
                  <option value="recent">Mais recente</option>
                  <option value="oldest">Mais antigo</option>
                  <option value="name">Nome (A-Z)</option>
                  <option value="name_desc">Nome (Z-A)</option>
                  <option value="rating">Maior nota</option>
                </select>
              </div>

              <!-- Rating mínimo -->
              <div>
                <label class="block text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider mb-2">
                  Nota mínima
                </label>
                <div class="flex items-center gap-1">
                  <button
                    v-for="n in 5"
                    :key="n"
                    type="button"
                    :class="[
                      'p-1.5 rounded transition-colors',
                      (state.ratingMin ?? 0) >= n ? 'text-(--color-accent-amber)' : 'text-(--color-text-muted) hover:text-(--color-text-secondary)',
                    ]"
                    @click="pickRating(n)"
                    :title="`Nota ≥ ${n}`"
                  >
                    <Star :size="20" :fill="(state.ratingMin ?? 0) >= n ? 'currentColor' : 'none'" />
                  </button>
                  <button
                    v-if="state.ratingMin !== null"
                    type="button"
                    class="ml-2 text-xs text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
                    @click="state.ratingMin = null"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <!-- Capa -->
              <div>
                <label class="block text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider mb-2">
                  Capa
                </label>
                <div class="flex flex-wrap gap-2">
                  <button type="button" :class="chipClass(state.hasCover === null)" @click="state.hasCover = null">
                    Todos
                  </button>
                  <button type="button" :class="chipClass(state.hasCover === true)" @click="pickHasCover(true)">
                    Com capa
                  </button>
                  <button type="button" :class="chipClass(state.hasCover === false)" @click="pickHasCover(false)">
                    Sem capa
                  </button>
                </div>
              </div>

              <!-- Filtros dinâmicos por field do schema -->
              <div v-for="def in visibleFields" :key="def.fieldKey" class="border-t border-(--color-bg-elevated) pt-4">
                <label class="block text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider mb-2">
                  {{ fieldTypeLabel(def) }}
                </label>

                <!-- text -->
                <input
                  v-if="def.fieldType === 'text'"
                  type="text"
                  :class="inputClass()"
                  :value="state.fieldFilters[def.fieldKey]?.contains ?? ''"
                  placeholder="Contém…"
                  @input="(e) => getFilter(def.fieldKey).contains = (e.target as HTMLInputElement).value || undefined"
                />

                <!-- select -->
                <div v-else-if="def.fieldType === 'select'" class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in def.selectOptions ?? []"
                    :key="opt"
                    type="button"
                    :class="chipClass(isSelectedSelect(def.fieldKey, opt))"
                    @click="setSelectMulti(def.fieldKey, opt)"
                  >
                    {{ opt }}
                  </button>
                </div>

                <!-- boolean -->
                <div v-else-if="def.fieldType === 'boolean'" class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    :class="chipClass(state.fieldFilters[def.fieldKey]?.boolValue === undefined || state.fieldFilters[def.fieldKey]?.boolValue === null)"
                    @click="setBoolean(def.fieldKey, null)"
                  >Todos</button>
                  <button
                    type="button"
                    :class="chipClass(state.fieldFilters[def.fieldKey]?.boolValue === true)"
                    @click="setBoolean(def.fieldKey, true)"
                  >Sim</button>
                  <button
                    type="button"
                    :class="chipClass(state.fieldFilters[def.fieldKey]?.boolValue === false)"
                    @click="setBoolean(def.fieldKey, false)"
                  >Não</button>
                </div>

                <!-- number / money -->
                <div v-else-if="def.fieldType === 'number' || def.fieldType === 'money'" class="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    :class="inputClass()"
                    placeholder="Mín."
                    :value="state.fieldFilters[def.fieldKey]?.gte ?? ''"
                    @input="(e) => {
                      const v = (e.target as HTMLInputElement).value
                      getFilter(def.fieldKey).gte = v === '' ? null : Number(v)
                    }"
                  />
                  <input
                    type="number"
                    :class="inputClass()"
                    placeholder="Máx."
                    :value="state.fieldFilters[def.fieldKey]?.lte ?? ''"
                    @input="(e) => {
                      const v = (e.target as HTMLInputElement).value
                      getFilter(def.fieldKey).lte = v === '' ? null : Number(v)
                    }"
                  />
                </div>

                <!-- date -->
                <div v-else-if="def.fieldType === 'date'" class="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    :class="inputClass()"
                    :value="(state.fieldFilters[def.fieldKey]?.gte as string) ?? ''"
                    @input="(e) => {
                      const v = (e.target as HTMLInputElement).value
                      getFilter(def.fieldKey).gte = v || null
                    }"
                  />
                  <input
                    type="date"
                    :class="inputClass()"
                    :value="(state.fieldFilters[def.fieldKey]?.lte as string) ?? ''"
                    @input="(e) => {
                      const v = (e.target as HTMLInputElement).value
                      getFilter(def.fieldKey).lte = v || null
                    }"
                  />
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 px-5 py-4 border-t border-(--color-bg-elevated)">
              <button
                type="button"
                class="text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                @click="clearAll"
              >
                Limpar tudo
              </button>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                  @click="emit('close')"
                >Cancelar</button>
                <button
                  type="button"
                  class="px-4 py-1.5 rounded-lg text-sm bg-(--color-accent-amber) text-[#0f0f1a] font-semibold hover:opacity-90 transition-opacity"
                  @click="applyAndClose"
                >Aplicar</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
