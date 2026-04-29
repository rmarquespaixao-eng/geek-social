<template>
  <div class="min-h-screen flex items-center justify-center bg-(--color-bg-base) p-4">
    <div class="w-full max-w-md">
      <!-- Logo + título -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-(--color-accent-amber) mb-4">
          <Gamepad2 :size="28" class="text-[#0f0f1a]" />
        </div>
        <h1 class="text-2xl font-bold text-(--color-text-primary)">Geek Social</h1>
        <p class="text-(--color-text-secondary) mt-1 text-sm">Bem-vindo de volta, jogador</p>
      </div>

      <!-- Card do formulário -->
      <div class="bg-(--color-bg-card) rounded-2xl p-6 shadow-xl border border-(--color-bg-elevated)">
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <!-- Email -->
          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-(--color-text-secondary)">E-mail</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
              :class="[
                'w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 transition-colors',
                fieldError('email')
                  ? 'border-(--color-danger) focus:ring-(--color-danger)/30'
                  : 'border-transparent focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20',
              ]"
            />
            <p v-if="fieldError('email')" class="text-xs text-(--color-danger)">{{ fieldError('email') }}</p>
          </div>

          <!-- Senha -->
          <div class="flex flex-col gap-1.5">
            <label for="password" class="text-sm font-medium text-(--color-text-secondary)">Senha</label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
                required
                :class="[
                  'w-full px-3 py-2.5 pr-10 rounded-lg bg-(--color-bg-elevated) border text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 transition-colors',
                  fieldError('password')
                    ? 'border-(--color-danger) focus:ring-(--color-danger)/30'
                    : 'border-transparent focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20',
                ]"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-muted) hover:text-(--color-text-secondary)"
              >
                <Eye v-if="!showPassword" :size="16" />
                <EyeOff v-else :size="16" />
              </button>
            </div>
          </div>

          <!-- Erro geral -->
          <p v-if="generalError" class="text-sm text-(--color-danger) text-center bg-(--color-danger)/10 rounded-lg px-3 py-2">
            {{ generalError }}
          </p>

          <!-- Link esqueci senha -->
          <div class="text-right -mt-2">
            <RouterLink to="/forgot-password" class="text-xs text-(--color-accent-amber) hover:underline">
              Esqueci minha senha
            </RouterLink>
          </div>

          <!-- Botão submit -->
          <AppButton type="submit" variant="primary" :loading="loading" class="w-full mt-1">
            Entrar
          </AppButton>
        </form>

        <!-- Divisor + Login social -->
        <div class="flex items-center gap-3 my-5">
          <div class="flex-1 h-px bg-(--color-bg-elevated)" />
          <span class="text-xs text-(--color-text-muted) uppercase tracking-wider">ou</span>
          <div class="flex-1 h-px bg-(--color-bg-elevated)" />
        </div>

        <a
          :href="googleLoginUrl"
          class="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-white text-[#1f1f1f] text-sm font-medium hover:bg-gray-50 transition-colors border border-gray-200"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.20455c0-.63864-.0573-1.25182-.1636-1.84091H9v3.48136h4.8436c-.2086 1.125-.8427 2.07818-1.7959 2.71636v2.25818h2.9082c1.7018-1.5668 2.6841-3.87409 2.6841-6.61499z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.4673-.80591 5.9564-2.18045l-2.9082-2.25818c-.8059.54-1.8368.85909-3.0482.85909-2.34409 0-4.32818-1.58318-5.03591-3.71045H.95682v2.33182C2.43818 15.9832 5.48182 18 9 18z" fill="#34A853"/>
            <path d="M3.96409 10.71c-.18-.54-.28227-1.11682-.28227-1.71s.10227-1.17.28227-1.71V4.95818H.95682C.34818 6.17318 0 7.54772 0 9c0 1.4523.34818 2.8268.95682 4.0418L3.96409 10.71z" fill="#FBBC05"/>
            <path d="M9 3.57955c1.32136 0 2.50773.45409 3.44045 1.34591l2.58136-2.58136C13.4632.891818 11.4259 0 9 0 5.48182 0 2.43818 2.01682.95682 4.95818L3.96409 7.29c.70773-2.12727 2.69182-3.71045 5.03591-3.71045z" fill="#EA4335"/>
          </svg>
          Continuar com Google
        </a>

        <!-- Link para registro -->
        <p class="text-center text-sm text-(--color-text-muted) mt-4">
          Ainda não tem conta?
          <RouterLink to="/register" class="text-(--color-accent-amber) hover:underline font-medium">
            Criar conta
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Gamepad2, Eye, EyeOff } from 'lucide-vue-next'
import AppButton from '@/shared/ui/AppButton.vue'
import { useAuth } from '@/shared/auth/useAuth'
import { getGoogleLoginUrl } from '../services/googleAuthService'

const router = useRouter()
const { login } = useAuth()
const googleLoginUrl = getGoogleLoginUrl()

const form = reactive({ email: '', password: '' })
const loading = ref(false)
const generalError = ref('')
const showPassword = ref(false)
const errors = reactive<Record<string, string>>({})

function fieldError(field: string) {
  return errors[field] ?? ''
}

async function handleSubmit() {
  generalError.value = ''
  Object.keys(errors).forEach((k) => delete errors[k])
  loading.value = true

  try {
    await login({ email: form.email, password: form.password })
    router.push('/feed')
  } catch (err: any) {
    const status = err.response?.status
    const message = err.response?.data?.error ?? err.response?.data?.message ?? 'Erro ao fazer login. Tente novamente.'
    if (status === 401) {
      generalError.value = 'E-mail ou senha incorretos.'
    } else {
      generalError.value = message
    }
  } finally {
    loading.value = false
  }
}
</script>
