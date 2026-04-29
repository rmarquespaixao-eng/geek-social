<template>
  <div class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated) mb-6">
    <h2 class="text-base font-semibold text-(--color-text-primary) mb-2">Conta Google</h2>
    <p class="text-sm text-(--color-text-muted) mb-4">
      Vincule sua conta Google para entrar com 1 clique. Você pode desvincular a qualquer momento.
    </p>

    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-xl bg-(--color-bg-elevated) flex items-center justify-center shrink-0">
        <svg width="22" height="22" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.20455c0-.63864-.0573-1.25182-.1636-1.84091H9v3.48136h4.8436c-.2086 1.125-.8427 2.07818-1.7959 2.71636v2.25818h2.9082c1.7018-1.5668 2.6841-3.87409 2.6841-6.61499z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.4673-.80591 5.9564-2.18045l-2.9082-2.25818c-.8059.54-1.8368.85909-3.0482.85909-2.34409 0-4.32818-1.58318-5.03591-3.71045H.95682v2.33182C2.43818 15.9832 5.48182 18 9 18z" fill="#34A853"/>
          <path d="M3.96409 10.71c-.18-.54-.28227-1.11682-.28227-1.71s.10227-1.17.28227-1.71V4.95818H.95682C.34818 6.17318 0 7.54772 0 9c0 1.4523.34818 2.8268.95682 4.0418L3.96409 10.71z" fill="#FBBC05"/>
          <path d="M9 3.57955c1.32136 0 2.50773.45409 3.44045 1.34591l2.58136-2.58136C13.4632.891818 11.4259 0 9 0 5.48182 0 2.43818 2.01682.95682 4.95818L3.96409 7.29c.70773-2.12727 2.69182-3.71045 5.03591-3.71045z" fill="#EA4335"/>
        </svg>
      </div>

      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-(--color-text-primary)">Google</p>
        <template v-if="!isLinked">
          <p class="text-xs text-(--color-text-muted) mt-0.5">Não vinculada</p>
          <AppButton
            variant="primary"
            class="mt-3 text-xs px-3 py-1.5"
            :loading="linking"
            @click="link"
          >
            Vincular conta Google
          </AppButton>
        </template>
        <template v-else>
          <p class="text-xs text-(--color-text-muted) mt-0.5">Vinculada</p>
          <p v-if="linkedAt" class="text-xs text-(--color-text-muted) mt-0.5">
            Em {{ formatDate(linkedAt) }}
          </p>
          <AppButton
            variant="danger"
            class="mt-3 text-xs px-3 py-1.5"
            :loading="unlinking"
            @click="askUnlink"
          >
            Desvincular
          </AppButton>
        </template>
        <p v-if="banner" class="text-xs mt-3 px-3 py-2 rounded-lg" :class="bannerClass">
          {{ banner }}
        </p>
      </div>
    </div>

    <AppConfirmDialog
      :open="showUnlinkConfirm"
      title="Desvincular conta Google?"
      :description="user?.hasPassword
        ? 'Você poderá continuar entrando com e-mail e senha. Pode revincular depois quando quiser.'
        : 'Defina uma senha primeiro — sem ela você ficará sem como entrar.'"
      :confirm-label="user?.hasPassword ? 'Desvincular' : 'Entendi'"
      :loading="unlinking"
      @cancel="showUnlinkConfirm = false"
      @confirm="user?.hasPassword ? confirmUnlink() : (showUnlinkConfirm = false)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/shared/auth/authStore'
import { useAuth } from '@/shared/auth/useAuth'
import * as googleAuthService from '../services/googleAuthService'
import AppButton from '@/shared/ui/AppButton.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import { formatNumericDate as formatDate } from '@/shared/utils/timeAgo'

const store = useAuthStore()
const route = useRoute()
const router = useRouter()
const { loadUser } = useAuth()

const user = computed(() => store.user)
const isLinked = computed(() => Boolean(user.value?.googleLinked))
const linkedAt = computed(() => user.value?.googleLinkedAt ?? null)

const linking = ref(false)
const unlinking = ref(false)
const showUnlinkConfirm = ref(false)
const banner = ref<string | null>(null)
const bannerClass = ref('')

function setBanner(message: string, ok: boolean) {
  banner.value = message
  bannerClass.value = ok
    ? 'text-(--color-status-online) bg-(--color-status-online)/10'
    : 'text-(--color-danger) bg-(--color-danger)/10'
  setTimeout(() => { banner.value = null }, 5000)
}

async function link() {
  linking.value = true
  try {
    const url = await googleAuthService.startGoogleLink()
    window.location.href = url
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } } }
    setBanner(e.response?.data?.error ?? 'Falha ao iniciar vinculação.', false)
    linking.value = false
  }
}

function askUnlink() {
  showUnlinkConfirm.value = true
}

async function confirmUnlink() {
  unlinking.value = true
  try {
    await googleAuthService.unlinkGoogle()
    await loadUser()
    showUnlinkConfirm.value = false
    setBanner('Conta Google desvinculada.', true)
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e.response?.data?.error
    if (code === 'PASSWORD_REQUIRED_BEFORE_UNLINK') {
      setBanner('Defina uma senha em "Segurança" antes de desvincular.', false)
    } else {
      setBanner('Erro ao desvincular. Tente novamente.', false)
    }
    showUnlinkConfirm.value = false
  } finally {
    unlinking.value = false
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_ALREADY_LINKED_TO_OTHER_USER: 'Esta conta Google já está vinculada a outro usuário.',
  INVALID_STATE: 'Sessão expirou. Tente novamente.',
  OAUTH_FAILED: 'Falha ao validar com o Google.',
  EMAIL_MISSING: 'O Google não retornou um e-mail.',
  LINK_FAILED: 'Não foi possível vincular.',
}

onMounted(handleQuery)
watch(() => route.query.google, handleQuery)

function handleQuery() {
  const status = route.query.google
  const code = (route.query.code as string) ?? ''
  if (status === 'linked') {
    setBanner('Conta Google vinculada com sucesso!', true)
    router.replace({ query: { ...route.query, google: undefined, code: undefined } })
  } else if (status === 'error') {
    setBanner(ERROR_MESSAGES[code] ?? `Erro ao vincular (${code || 'desconhecido'}).`, false)
    router.replace({ query: { ...route.query, google: undefined, code: undefined } })
  }
}
</script>
