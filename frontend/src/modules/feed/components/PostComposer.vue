<!-- src/modules/feed/components/PostComposer.vue -->
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { ImagePlus, Send, X, Globe, Users, Lock, Play } from 'lucide-vue-next'
import { postsService } from '../services/postsService'
import { useFeed } from '../composables/useFeed'
import { useAuthStore } from '@/shared/auth/authStore'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'

const emit = defineEmits<{ posted: [] }>()

const feed = useFeed()
const auth = useAuthStore()
const featureFlags = useFeatureFlagsStore()

const hasFriends = computed(() => featureFlags.isEnabled('module_friends'))

const content = ref('')
const visibility = ref<'public' | 'friends_only' | 'private'>('public')
const selectedFiles = ref<File[]>([])
const previewUrls = ref<string[]>([])
const submitting = ref(false)
const uploadProgress = ref(0)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const canSubmit = computed(() => content.value.trim().length > 0 && !submitting.value)

const allVisibilityOptions = [
  { value: 'public', label: 'Público', icon: Globe },
  { value: 'friends_only', label: 'Amigos', icon: Users },
  { value: 'private', label: 'Privado', icon: Lock },
] as const

const visibilityOptions = computed(() =>
  allVisibilityOptions.filter(o => o.value !== 'friends_only' || hasFriends.value),
)

watch(hasFriends, (enabled) => {
  if (!enabled && visibility.value === 'friends_only') visibility.value = 'public'
})

const MAX_FILES = 8
const VIDEO_MAX_BYTES = 50 * 1024 * 1024

function isVideo(file: File): boolean {
  return file.type.startsWith('video/')
}

function onFileChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  for (const file of files) {
    if (selectedFiles.value.length >= MAX_FILES) break
    if (isVideo(file) && file.size > VIDEO_MAX_BYTES) {
      uploadError.value = 'Vídeo deve ter no máximo 50MB.'
      continue
    }
    selectedFiles.value.push(file)
    previewUrls.value.push(URL.createObjectURL(file))
  }
  if (fileInput.value) fileInput.value.value = ''
}

function removeFile(index: number) {
  URL.revokeObjectURL(previewUrls.value[index])
  selectedFiles.value.splice(index, 1)
  previewUrls.value.splice(index, 1)
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

onUnmounted(() => {
  for (const url of previewUrls.value) URL.revokeObjectURL(url)
})

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  uploadProgress.value = 0
  uploadError.value = null
  try {
    let post = await postsService.createPost({ content: content.value.trim(), visibility: visibility.value })
    if (selectedFiles.value.length > 0) {
      post = await postsService.addMedia(post.id, selectedFiles.value, (pct) => {
        uploadProgress.value = pct
      })
    }
    feed.prependProfilePost(post)
    emit('posted')
    content.value = ''
    for (const url of previewUrls.value) URL.revokeObjectURL(url)
    selectedFiles.value = []
    previewUrls.value = []
    if (textareaEl.value) textareaEl.value.style.height = 'auto'
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    const friendly: Record<string, string> = {
      MEDIA_LIMIT_EXCEEDED: 'Limite de 8 mídias por post.',
      MEDIA_TOO_LARGE: 'Vídeo deve ter no máximo 50MB.',
      UNSUPPORTED_VIDEO_FORMAT: 'Formato de vídeo não suportado (use mp4, webm ou mov).',
      UNSUPPORTED_MEDIA_FORMAT: 'Formato de arquivo não suportado.',
    }
    uploadError.value = (msg && friendly[msg]) ?? msg ?? 'Erro ao enviar mídia'
    console.error('[addMedia]', err)
  } finally {
    submitting.value = false
    uploadProgress.value = 0
  }
}
</script>

<template>
  <div class="bg-[#1e2038] rounded-2xl p-4 space-y-3">
    <div class="flex gap-3">
      <!-- Avatar do usuário -->
      <img
        v-if="auth.user?.avatarUrl"
        :src="auth.user.avatarUrl"
        :alt="auth.user.displayName"
        class="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
      <div
        v-else
        class="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm font-semibold text-amber-400 flex-shrink-0"
      >
        {{ auth.user?.displayName?.charAt(0).toUpperCase() ?? '?' }}
      </div>

      <!-- Textarea expansível -->
      <textarea
        ref="textareaEl"
        v-model="content"
        @input="autoResize"
        placeholder="O que você está jogando hoje? 🎮"
        rows="2"
        class="flex-1 bg-[#252640] text-slate-200 placeholder-slate-500 text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 overflow-hidden min-h-[56px]"
      />
    </div>

    <!-- Preview das mídias selecionadas -->
    <div v-if="previewUrls.length > 0" class="flex gap-2 flex-wrap ml-13">
      <div
        v-for="(url, i) in previewUrls"
        :key="url"
        class="relative"
      >
        <video
          v-if="selectedFiles[i] && selectedFiles[i].type.startsWith('video/')"
          :src="url"
          class="h-20 w-20 rounded-lg object-cover bg-black"
          muted
          playsinline
        />
        <img v-else :src="url" class="h-20 w-20 rounded-lg object-cover" />
        <div
          v-if="selectedFiles[i] && selectedFiles[i].type.startsWith('video/')"
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div class="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
            <Play :size="14" class="text-white ml-0.5" fill="white" />
          </div>
        </div>
        <button
          @click="removeFile(i)"
          class="absolute -top-1.5 -right-1.5 bg-black/70 hover:bg-black/90 rounded-full p-0.5 text-white transition-colors"
        >
          <X :size="12" />
        </button>
      </div>
    </div>

    <!-- Erro de upload -->
    <p v-if="uploadError" class="text-xs text-red-400">{{ uploadError }}</p>

    <!-- Progress de upload -->
    <div v-if="submitting && selectedFiles.length > 0" class="space-y-1">
      <div class="flex justify-between text-xs text-slate-500">
        <span>Enviando mídias...</span>
        <span>{{ uploadProgress }}%</span>
      </div>
      <div class="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-amber-500 rounded-full transition-all duration-300"
          :style="{ width: uploadProgress + '%' }"
        />
      </div>
    </div>

    <!-- Barra de ações -->
    <div class="flex items-center justify-between ml-13">
      <div class="flex items-center gap-1">
        <button
          @click="fileInput?.click()"
          :disabled="selectedFiles.length >= MAX_FILES"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <ImagePlus :size="16" />
          <span>{{ selectedFiles.length > 0 ? `${selectedFiles.length}/${MAX_FILES}` : 'Foto/Vídeo' }}</span>
        </button>
        <input ref="fileInput" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple class="hidden" @change="onFileChange" />

        <!-- Seletor de visibilidade -->
        <div class="flex items-center rounded-lg overflow-hidden border border-slate-700">
          <button
            v-for="opt in visibilityOptions"
            :key="opt.value"
            @click="visibility = opt.value"
            :title="opt.label"
            :class="[
              'flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors',
              visibility === opt.value
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
            ]"
          >
            <component :is="opt.icon" :size="13" />
            <span class="hidden sm:inline">{{ opt.label }}</span>
          </button>
        </div>
      </div>

      <button
        @click="submit"
        :disabled="!canSubmit"
        class="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#0f0f1a] text-sm font-bold rounded-xl transition-colors"
      >
        <Send :size="15" />
        {{ submitting ? (selectedFiles.length > 0 ? 'Enviando…' : 'Publicando…') : 'Publicar' }}
      </button>
    </div>
  </div>
</template>
