<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { X, Plus, ImagePlus, Trash2 } from 'lucide-vue-next'
import AppButton from '@/shared/ui/AppButton.vue'
import * as usersService from '../services/usersService'
import { useAuthStore } from '@/shared/auth/authStore'
import type { PublicProfile } from '@/shared/types/auth.types'

const props = defineProps<{
  open: boolean
  profile: PublicProfile
}>()

const emit = defineEmits<{
  close: []
  saved: [profile: PublicProfile]
  'background-updated': [payload: { url: string | null; color: string | null }]
  'cover-updated': [payload: { url: string | null; color: string | null }]
}>()

const authStore = useAuthStore()

type FormState = {
  displayName: string
  bio: string
  privacy: 'public' | 'friends_only' | 'private'
  birthday: string
  pronouns: string
  location: string
  website: string
  interests: string[]
}

function emptyForm(): FormState {
  return {
    displayName: props.profile.displayName ?? '',
    bio: props.profile.bio ?? '',
    privacy: (props.profile.privacy as FormState['privacy']) ?? 'public',
    birthday: props.profile.birthday ?? '',
    pronouns: props.profile.pronouns ?? '',
    location: props.profile.location ?? '',
    website: props.profile.website ?? '',
    interests: [...(props.profile.interests ?? [])],
  }
}

const form = reactive<FormState>(emptyForm())
const interestInput = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (open) => {
  if (open) {
    Object.assign(form, emptyForm())
    interestInput.value = ''
    error.value = null
  }
})

function addInterest() {
  const v = interestInput.value.trim()
  if (!v) return
  if (form.interests.length >= 20) {
    error.value = 'Máximo de 20 interesses.'
    return
  }
  if (v.length > 40) {
    error.value = 'Cada interesse aceita no máximo 40 caracteres.'
    return
  }
  if (!form.interests.includes(v)) form.interests.push(v)
  interestInput.value = ''
  error.value = null
}

function removeInterest(value: string) {
  form.interests = form.interests.filter(i => i !== value)
}

function onInterestKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addInterest()
  }
}

async function save() {
  saving.value = true
  error.value = null
  try {
    const updated = await usersService.updateProfile({
      displayName: form.displayName.trim() || undefined,
      bio: form.bio.trim() === '' ? null : form.bio,
      privacy: form.privacy,
      birthday: form.birthday || null,
      pronouns: form.pronouns.trim() === '' ? null : form.pronouns.trim(),
      location: form.location.trim() === '' ? null : form.location.trim(),
      website: form.website.trim() === '' ? null : form.website.trim(),
      interests: form.interests,
    })
    // Atualiza o store local
    if (authStore.user) {
      authStore.setUser({
        ...authStore.user,
        displayName: updated.displayName,
        bio: updated.bio,
        privacy: updated.privacy as any,
        birthday: updated.birthday,
        interests: updated.interests,
        pronouns: updated.pronouns,
        location: updated.location,
        website: updated.website,
      })
    }
    emit('saved', { ...props.profile, ...updated })
    emit('close')
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? err?.response?.data?.message
    error.value = msg ?? 'Erro ao salvar perfil.'
  } finally {
    saving.value = false
  }
}

function inputClass() {
  return 'w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20 border border-transparent focus:border-(--color-accent-amber)'
}

// Background customizado do perfil
const bgUploading = ref(false)
const bgColor = ref<string>(props.profile.profileBackgroundColor ?? '#1e2038')

watch(() => props.profile.profileBackgroundColor, (c) => { if (c) bgColor.value = c })

async function onBackgroundChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Imagem muito grande (máx 5MB).'
    return
  }
  bgUploading.value = true
  error.value = null
  try {
    const result = await usersService.uploadProfileBackground(file)
    emit('background-updated', { url: result.profileBackgroundUrl, color: null })
  } catch {
    error.value = 'Erro ao enviar imagem de fundo.'
  } finally {
    bgUploading.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}

async function applyBackgroundColor() {
  bgUploading.value = true
  error.value = null
  try {
    const result = await usersService.setProfileBackgroundColor(bgColor.value)
    emit('background-updated', { url: result.profileBackgroundUrl, color: result.profileBackgroundColor })
  } catch {
    error.value = 'Erro ao aplicar cor de fundo.'
  } finally {
    bgUploading.value = false
  }
}

async function clearBackground() {
  bgUploading.value = true
  error.value = null
  try {
    if (props.profile.profileBackgroundUrl) {
      await usersService.deleteProfileBackground()
    }
    if (props.profile.profileBackgroundColor) {
      await usersService.setProfileBackgroundColor(null)
    }
    emit('background-updated', { url: null, color: null })
  } catch {
    error.value = 'Erro ao remover fundo.'
  } finally {
    bgUploading.value = false
  }
}

// Capa
const coverUploading = ref(false)
const coverColor = ref<string>(props.profile.coverColor ?? '#252640')

watch(() => props.profile.coverColor, (c) => { if (c) coverColor.value = c })

async function onCoverChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Imagem muito grande (máx 5MB).'
    return
  }
  coverUploading.value = true
  error.value = null
  try {
    const result = await usersService.uploadCover(file)
    emit('cover-updated', { url: result.coverUrl, color: null })
  } catch {
    error.value = 'Erro ao enviar capa.'
  } finally {
    coverUploading.value = false
    ;(event.target as HTMLInputElement).value = ''
  }
}

async function applyCoverColor() {
  coverUploading.value = true
  error.value = null
  try {
    const result = await usersService.setCoverColor(coverColor.value)
    emit('cover-updated', { url: result.coverUrl, color: result.coverColor })
  } catch {
    error.value = 'Erro ao aplicar cor da capa.'
  } finally {
    coverUploading.value = false
  }
}

async function clearCover() {
  coverUploading.value = true
  error.value = null
  try {
    if (props.profile.coverUrl) {
      await usersService.deleteCover()
    }
    if (props.profile.coverColor) {
      await usersService.setCoverColor(null)
    }
    emit('cover-updated', { url: null, color: null })
  } catch {
    error.value = 'Erro ao remover capa.'
  } finally {
    coverUploading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-lg max-h-[90vh] overflow-hidden bg-(--color-bg-card) rounded-2xl border border-(--color-bg-elevated) shadow-2xl flex flex-col"
        @click.stop
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-(--color-bg-elevated)">
          <h2 class="text-base font-bold text-(--color-text-primary)">Editar perfil</h2>
          <button
            type="button"
            class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </div>

        <form class="overflow-y-auto px-5 py-4 space-y-4" @submit.prevent="save">
          <!-- Nome -->
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-(--color-text-secondary)">Nome de exibição</label>
            <input v-model="form.displayName" type="text" maxlength="100" :class="inputClass()" />
          </div>

          <!-- Bio -->
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-(--color-text-secondary)">Sobre</label>
            <textarea
              v-model="form.bio"
              rows="5"
              maxlength="10000"
              placeholder="Conte um pouco sobre você..."
              :class="[inputClass(), 'resize-y min-h-[120px]']"
            />
            <p class="text-xs text-(--color-text-muted) text-right">{{ form.bio.length }}/10000</p>
          </div>

          <!-- Pronomes / Localização (lado a lado) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-(--color-text-secondary)">Pronomes</label>
              <input v-model="form.pronouns" type="text" maxlength="50" placeholder="ex: ele/dele" :class="inputClass()" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-(--color-text-secondary)">Localização</label>
              <input v-model="form.location" type="text" maxlength="120" placeholder="ex: São Paulo, BR" :class="inputClass()" />
            </div>
          </div>

          <!-- Aniversário / Website -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-(--color-text-secondary)">Aniversário</label>
              <input v-model="form.birthday" type="date" :class="inputClass()" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-(--color-text-secondary)">Site</label>
              <input v-model="form.website" type="url" maxlength="255" placeholder="https://..." :class="inputClass()" />
            </div>
          </div>

          <!-- Interesses -->
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-(--color-text-secondary)">Interesses</label>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in form.interests"
                :key="tag"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-(--color-accent-amber)/15 text-(--color-accent-amber) text-xs"
              >
                {{ tag }}
                <button
                  type="button"
                  class="hover:text-(--color-text-primary)"
                  @click="removeInterest(tag)"
                  title="Remover"
                >
                  <X :size="12" />
                </button>
              </span>
            </div>
            <div class="flex gap-2">
              <input
                v-model="interestInput"
                type="text"
                maxlength="40"
                placeholder="ex: RPG, anime, tabletop..."
                :class="inputClass()"
                @keydown="onInterestKeydown"
              />
              <button
                type="button"
                class="flex items-center gap-1 px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-sm transition-colors disabled:opacity-50"
                :disabled="!interestInput.trim() || form.interests.length >= 20"
                @click="addInterest"
              >
                <Plus :size="14" />
              </button>
            </div>
            <p class="text-xs text-(--color-text-muted)">{{ form.interests.length }}/20 — Enter ou vírgula para adicionar.</p>
          </div>

          <!-- Capa -->
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-(--color-text-secondary)">Capa do perfil</label>
            <div class="flex items-center gap-3">
              <div
                class="h-14 w-24 rounded-lg bg-(--color-bg-elevated) bg-cover bg-center border border-(--color-bg-elevated)"
                :style="profile.coverUrl
                  ? { backgroundImage: `url(${profile.coverUrl})` }
                  : profile.coverColor
                    ? { backgroundColor: profile.coverColor }
                    : undefined"
              >
                <div v-if="!profile.coverUrl && !profile.coverColor" class="h-full w-full flex items-center justify-center text-(--color-text-muted)">
                  <ImagePlus :size="18" />
                </div>
              </div>
              <div class="flex flex-col gap-1.5 flex-1">
                <div class="flex items-center gap-2">
                  <label class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-xs font-medium cursor-pointer transition-colors disabled:opacity-50">
                    <ImagePlus :size="13" />
                    Imagem
                    <input type="file" accept="image/*" class="hidden" :disabled="coverUploading" @change="onCoverChange" />
                  </label>
                  <input
                    v-model="coverColor"
                    type="color"
                    class="h-8 w-10 rounded cursor-pointer bg-(--color-bg-elevated) border border-(--color-bg-elevated)"
                    title="Escolher cor"
                  />
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-xs font-medium transition-colors disabled:opacity-50"
                    :disabled="coverUploading"
                    @click="applyCoverColor"
                  >
                    Aplicar cor
                  </button>
                </div>
                <button
                  v-if="profile.coverUrl || profile.coverColor"
                  type="button"
                  class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-(--color-danger) hover:bg-(--color-danger)/10 transition-colors disabled:opacity-50"
                  :disabled="coverUploading"
                  @click="clearCover"
                >
                  <Trash2 :size="13" />
                  Remover capa
                </button>
              </div>
            </div>
          </div>

          <!-- Fundo -->
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-(--color-text-secondary)">Fundo do perfil</label>
            <div class="flex items-center gap-3">
              <div
                class="h-14 w-24 rounded-lg bg-(--color-bg-elevated) bg-cover bg-center border border-(--color-bg-elevated)"
                :style="profile.profileBackgroundUrl
                  ? { backgroundImage: `url(${profile.profileBackgroundUrl})` }
                  : profile.profileBackgroundColor
                    ? { backgroundColor: profile.profileBackgroundColor }
                    : undefined"
              >
                <div v-if="!profile.profileBackgroundUrl && !profile.profileBackgroundColor" class="h-full w-full flex items-center justify-center text-(--color-text-muted)">
                  <ImagePlus :size="18" />
                </div>
              </div>
              <div class="flex flex-col gap-1.5 flex-1">
                <div class="flex items-center gap-2">
                  <label class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-xs font-medium cursor-pointer transition-colors disabled:opacity-50">
                    <ImagePlus :size="13" />
                    Imagem
                    <input type="file" accept="image/*" class="hidden" :disabled="bgUploading" @change="onBackgroundChange" />
                  </label>
                  <input
                    v-model="bgColor"
                    type="color"
                    class="h-8 w-10 rounded cursor-pointer bg-(--color-bg-elevated) border border-(--color-bg-elevated)"
                    title="Escolher cor"
                  />
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-xs font-medium transition-colors disabled:opacity-50"
                    :disabled="bgUploading"
                    @click="applyBackgroundColor"
                  >
                    Aplicar cor
                  </button>
                </div>
                <button
                  v-if="profile.profileBackgroundUrl || profile.profileBackgroundColor"
                  type="button"
                  class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-(--color-danger) hover:bg-(--color-danger)/10 transition-colors disabled:opacity-50"
                  :disabled="bgUploading"
                  @click="clearBackground"
                >
                  <Trash2 :size="13" />
                  Remover fundo
                </button>
              </div>
            </div>
            <p class="text-xs text-(--color-text-muted)">Imagem ou cor sólida atrás do perfil. Máx 5MB.</p>
          </div>

          <!-- Privacidade -->
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-(--color-text-secondary)">Privacidade do perfil</label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="radio" v-model="form.privacy" value="public" class="mt-0.5 accent-(--color-accent-amber)" />
              <div>
                <p class="text-sm text-(--color-text-primary) font-medium">Público</p>
                <p class="text-xs text-(--color-text-muted)">Qualquer pessoa pode ver seu perfil e posts</p>
              </div>
            </label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="radio" v-model="form.privacy" value="friends_only" class="mt-0.5 accent-(--color-accent-amber)" />
              <div>
                <p class="text-sm text-(--color-text-primary) font-medium">Apenas amigos</p>
                <p class="text-xs text-(--color-text-muted)">Somente amigos veem seu conteúdo completo</p>
              </div>
            </label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="radio" v-model="form.privacy" value="private" class="mt-0.5 accent-(--color-accent-amber)" />
              <div>
                <p class="text-sm text-(--color-text-primary) font-medium">Privado</p>
                <p class="text-xs text-(--color-text-muted)">Só você pode ver seu perfil e posts</p>
              </div>
            </label>
          </div>

          <p v-if="error" class="text-sm text-(--color-danger) bg-(--color-danger)/10 rounded-lg px-3 py-2">
            {{ error }}
          </p>
        </form>

        <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-(--color-bg-elevated)">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            @click="emit('close')"
          >Cancelar</button>
          <AppButton variant="primary" :loading="saving" @click="save">Salvar</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
