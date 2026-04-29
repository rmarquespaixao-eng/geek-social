<template>
  <div class="min-h-screen flex items-center justify-center bg-(--color-bg-base) p-4">
    <div class="w-full max-w-md">
      <div class="bg-(--color-bg-card) rounded-2xl p-8 shadow-xl border border-(--color-bg-elevated) text-center flex flex-col items-center gap-4">
        <template v-if="state === 'loading'">
          <div class="w-10 h-10 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
          <p class="text-sm text-(--color-text-secondary)">Conectando sua conta...</p>
        </template>
        <template v-else-if="state === 'error'">
          <AlertCircle :size="40" class="text-(--color-danger)" />
          <h2 class="text-lg font-bold text-(--color-text-primary)">Não foi possível continuar</h2>
          <p class="text-sm text-(--color-text-secondary)">{{ errorMessage }}</p>
          <RouterLink
            to="/login"
            class="w-full mt-2 inline-block text-center px-4 py-2.5 rounded-lg bg-(--color-accent-amber) text-[#0f0f1a] font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Voltar para o login
          </RouterLink>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertCircle } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useAuth } from '@/shared/auth/useAuth'
import { connectSocket } from '@/shared/socket/socket'

const route = useRoute()
const router = useRouter()
const store = useAuthStore()
const { loadUser } = useAuth()

const state = ref<'loading' | 'error'>('loading')
const errorMessage = ref('')

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STATE: 'A sessão de autenticação expirou. Tente novamente.',
  OAUTH_FAILED: 'Não conseguimos validar sua conta com o provedor.',
  EMAIL_MISSING: 'O provedor não retornou um e-mail. Use outra forma de entrar.',
  LOGIN_FAILED: 'Erro inesperado ao concluir o login.',
  LINK_FAILED: 'Não foi possível vincular a conta.',
  GOOGLE_ALREADY_LINKED_TO_OTHER_USER: 'Esta conta Google já está vinculada a outro usuário.',
}

onMounted(async () => {
  const status = (route.query.status as string | undefined) ?? ''
  const code = (route.query.code as string | undefined) ?? ''
  const token = (route.query.token as string | undefined) ?? ''

  if (status === 'error') {
    state.value = 'error'
    errorMessage.value = ERROR_MESSAGES[code] ?? 'Erro ao concluir a autenticação.'
    return
  }

  if (status === 'linked') {
    await loadUser()
    router.replace({ path: '/settings', query: { google: 'linked' } })
    return
  }

  if ((status === 'registered' || status === 'logged-in' || status === 'linked-login') && token) {
    store.setToken(token)
    try {
      await loadUser()
      connectSocket(token)
      router.replace('/feed')
    } catch {
      state.value = 'error'
      errorMessage.value = 'Não foi possível carregar seu perfil.'
    }
    return
  }

  state.value = 'error'
  errorMessage.value = 'Resposta inválida do provedor.'
})
</script>
