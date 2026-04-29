<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CreateCommunityPayload, CommunityCategory, CommunityVisibility, CommunitySummary } from '../types'

const props = defineProps<{
  /** When provided the form works in edit mode with prefilled values. */
  initial?: Partial<CommunitySummary>
  loading?: boolean
  error?: Error | null
}>()

const emit = defineEmits<{
  submit: [payload: CreateCommunityPayload, cover: File | null, icon: File | null]
  cancel: []
}>()

const CATEGORIES: { value: CommunityCategory; label: string }[] = [
  { value: 'boardgames', label: 'Board Games' },
  { value: 'tcg', label: 'TCG' },
  { value: 'rpg-mesa', label: 'RPG de Mesa' },
  { value: 'rpg-digital', label: 'RPG Digital' },
  { value: 'mmo', label: 'MMO' },
  { value: 'souls', label: 'Souls-like' },
  { value: 'fps', label: 'FPS' },
  { value: 'survival', label: 'Survival' },
  { value: 'indie', label: 'Indie' },
  { value: 'retro', label: 'Retro' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'simulation', label: 'Simulação' },
  { value: 'strategy', label: 'Estratégia' },
  { value: 'mods', label: 'Mods' },
  { value: 'community-events', label: 'Eventos de Comunidade' },
]

const VISIBILITIES: { value: CommunityVisibility; label: string; description: string }[] = [
  { value: 'public', label: 'Pública', description: 'Qualquer pessoa pode ver e entrar.' },
  { value: 'restricted', label: 'Restrita', description: 'Qualquer pessoa pode ver, mas precisa pedir entrada.' },
  { value: 'private', label: 'Privada', description: 'Só membros podem ver. Acesso por convite.' },
]

const name = ref(props.initial?.name ?? '')
const description = ref(props.initial?.description ?? '')
const category = ref<CommunityCategory>(props.initial?.category ?? 'boardgames')
const visibility = ref<CommunityVisibility>(props.initial?.visibility ?? 'public')

// Cover file
const cover = ref<File | null>(null)
const coverPreview = ref<string | null>(props.initial?.coverUrl ?? null)
const coverError = ref<string | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)

// Icon file
const icon = ref<File | null>(null)
const iconPreview = ref<string | null>(props.initial?.iconUrl ?? null)
const iconError = ref<string | null>(null)
const iconInput = ref<HTMLInputElement | null>(null)

const isEditMode = computed(() => !!props.initial?.id)

function validateImage(file: File, maxMB: number): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Formato inválido. Use JPEG, PNG ou WebP.'
  }
  if (file.size > maxMB * 1024 * 1024) {
    return `Tamanho máximo: ${maxMB}MB.`
  }
  return null
}

function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const err = validateImage(file, 5)
  if (err) { coverError.value = err; return }
  coverError.value = null
  cover.value = file
  coverPreview.value = URL.createObjectURL(file)
}

function onIconChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const err = validateImage(file, 2)
  if (err) { iconError.value = err; return }
  iconError.value = null
  icon.value = file
  iconPreview.value = URL.createObjectURL(file)
}

function onSubmit() {
  if (!isEditMode.value && !cover.value) {
    coverError.value = 'Imagem de capa obrigatória.'
    return
  }
  if (!isEditMode.value && !icon.value) {
    iconError.value = 'Ícone obrigatório.'
    return
  }
  emit(
    'submit',
    { name: name.value, description: description.value, category: category.value, visibility: visibility.value },
    cover.value ?? null,
    icon.value ?? null,
  )
}
</script>

<template>
  <form
    class="space-y-5"
    data-testid="community-form"
    @submit.prevent="onSubmit"
  >
    <!-- Cover upload -->
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1.5">
        Imagem de capa <span v-if="!isEditMode" class="text-red-400">*</span>
      </label>
      <div
        class="relative h-32 bg-slate-700/40 rounded-xl overflow-hidden border border-[#252640] cursor-pointer group"
        @click="coverInput?.click()"
      >
        <img
          v-if="coverPreview"
          :src="coverPreview"
          alt="Preview da capa"
          class="w-full h-full object-cover"
        />
        <div
          class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span class="text-xs text-white font-semibold">Trocar capa</span>
        </div>
        <div
          v-if="!coverPreview"
          class="flex items-center justify-center h-full text-slate-500 text-xs"
        >
          Clique para enviar capa (JPEG/PNG/WebP ≤5MB)
        </div>
      </div>
      <input
        ref="coverInput"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="hidden"
        @change="onCoverChange"
      />
      <p v-if="coverError" class="mt-1 text-xs text-red-400">{{ coverError }}</p>
    </div>

    <!-- Icon upload -->
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1.5">
        Ícone <span v-if="!isEditMode" class="text-red-400">*</span>
      </label>
      <div class="flex items-center gap-3">
        <div
          class="relative w-16 h-16 rounded-xl bg-slate-700/40 border border-[#252640] overflow-hidden cursor-pointer group flex-shrink-0"
          @click="iconInput?.click()"
        >
          <img
            v-if="iconPreview"
            :src="iconPreview"
            alt="Preview do ícone"
            class="w-full h-full object-cover"
          />
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <span class="text-[10px] text-white font-semibold text-center">Trocar</span>
          </div>
          <div v-if="!iconPreview" class="flex items-center justify-center h-full text-slate-500 text-[10px] text-center px-1">
            Ícone quadrado
          </div>
        </div>
        <p class="text-xs text-slate-500">JPEG/PNG/WebP · quadrado · ≤2MB</p>
      </div>
      <input
        ref="iconInput"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="hidden"
        @change="onIconChange"
      />
      <p v-if="iconError" class="mt-1 text-xs text-red-400">{{ iconError }}</p>
    </div>

    <!-- Name -->
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1.5">
        Nome da comunidade <span class="text-red-400">*</span>
      </label>
      <input
        v-model="name"
        type="text"
        required
        maxlength="80"
        placeholder="Ex: Board Games de SP"
        data-testid="community-name"
        class="w-full bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-slate-600"
      />
      <p class="mt-0.5 text-right text-[10px] text-slate-600">{{ name.length }}/80</p>
    </div>

    <!-- Description -->
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1.5">
        Descrição <span class="text-red-400">*</span>
      </label>
      <textarea
        v-model="description"
        required
        maxlength="2000"
        rows="4"
        placeholder="Do que se trata essa comunidade?"
        data-testid="community-description"
        class="w-full bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-slate-600"
      />
      <p class="mt-0.5 text-right text-[10px] text-slate-600">{{ description.length }}/2000</p>
    </div>

    <!-- Category -->
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-1.5">
        Categoria <span class="text-red-400">*</span>
      </label>
      <select
        v-model="category"
        required
        data-testid="community-category"
        class="w-full bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      >
        <option v-for="cat in CATEGORIES" :key="cat.value" :value="cat.value">
          {{ cat.label }}
        </option>
      </select>
    </div>

    <!-- Visibility -->
    <div>
      <label class="block text-xs font-semibold text-slate-400 mb-2">
        Visibilidade
      </label>
      <div class="space-y-2">
        <label
          v-for="opt in VISIBILITIES"
          :key="opt.value"
          class="flex items-start gap-3 cursor-pointer"
        >
          <input
            type="radio"
            :value="opt.value"
            v-model="visibility"
            class="mt-0.5 accent-amber-500"
          />
          <div>
            <p class="text-sm font-semibold text-slate-200">{{ opt.label }}</p>
            <p class="text-xs text-slate-500">{{ opt.description }}</p>
          </div>
        </label>
      </div>
    </div>

    <!-- Error -->
    <p v-if="error" class="text-xs text-red-400" role="alert">
      {{ error.message }}
    </p>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-1">
      <button
        type="button"
        data-testid="community-form-cancel"
        @click="emit('cancel')"
        class="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
      >
        Cancelar
      </button>
      <button
        type="submit"
        data-testid="community-form-submit"
        :disabled="loading"
        class="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {{ loading ? 'Salvando…' : (isEditMode ? 'Salvar alterações' : 'Criar comunidade') }}
      </button>
    </div>
  </form>
</template>
