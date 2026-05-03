<template>
  <div class="min-h-screen flex items-center justify-center bg-(--color-bg-base) p-4">
    <div class="w-full max-w-md">

      <!-- Estado de sucesso -->
      <div v-if="registrationSuccess" class="bg-(--color-bg-card) rounded-2xl p-8 shadow-xl border border-(--color-bg-elevated) text-center flex flex-col items-center gap-4">
        <CheckCircle :size="48" class="text-(--color-accent-amber)" />
        <h2 class="text-xl font-bold text-(--color-text-primary)">Conta criada com sucesso!</h2>
        <p class="text-(--color-text-secondary) text-sm">Agora é só entrar com o seu e-mail e senha para acessar a plataforma.</p>
        <RouterLink
          to="/login"
          class="w-full mt-2 inline-block text-center px-4 py-2.5 rounded-lg bg-(--color-accent-amber) text-[#0f0f1a] font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Fazer login
        </RouterLink>
      </div>

      <!-- Registros desabilitados -->
      <div v-else-if="!registrationsEnabled()" class="bg-(--color-bg-card) rounded-2xl p-8 shadow-xl border border-(--color-bg-elevated) text-center flex flex-col items-center gap-4">
        <Lock :size="48" class="text-(--color-text-muted)" />
        <h2 class="text-xl font-bold text-(--color-text-primary)">Cadastros pausados</h2>
        <p class="text-(--color-text-secondary) text-sm">No momento não estamos aceitando novos cadastros. Volte em breve!</p>
        <RouterLink to="/login" class="text-sm text-(--color-accent-amber) hover:underline">Já tem uma conta? Fazer login</RouterLink>
      </div>

      <!-- Formulário de registro -->
      <template v-else>
      <!-- Logo + título -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-(--color-accent-amber) mb-4">
          <Gamepad2 :size="28" class="text-[#0f0f1a]" />
        </div>
        <h1 class="text-2xl font-bold text-(--color-text-primary)">Criar conta</h1>
        <p class="text-(--color-text-secondary) mt-1 text-sm">Junte-se à comunidade geek</p>
      </div>

      <div class="bg-(--color-bg-card) rounded-2xl p-6 shadow-xl border border-(--color-bg-elevated)">
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <!-- Nome de exibição -->
          <div class="flex flex-col gap-1.5">
            <label for="displayName" class="text-sm font-medium text-(--color-text-secondary)">Nome de exibição</label>
            <input
              id="displayName"
              v-model="form.displayName"
              type="text"
              autocomplete="name"
              placeholder="Seu nome na plataforma"
              required
              minlength="2"
              maxlength="50"
              :class="inputClass('displayName')"
            />
            <p v-if="errors.displayName" class="text-xs text-(--color-danger)">{{ errors.displayName }}</p>
          </div>

          <!-- E-mail -->
          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-(--color-text-secondary)">E-mail</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
              :class="inputClass('email')"
            />
            <p v-if="errors.email" class="text-xs text-(--color-danger)">{{ errors.email }}</p>
          </div>

          <!-- Senha -->
          <div class="flex flex-col gap-1.5">
            <label for="password" class="text-sm font-medium text-(--color-text-secondary)">Senha</label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Mínimo 8 caracteres"
                required
                :class="inputClass('password') + ' pr-10'"
              />
              <button type="button" @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-muted) hover:text-(--color-text-secondary)">
                <Eye v-if="!showPassword" :size="16" />
                <EyeOff v-else :size="16" />
              </button>
            </div>
            <p v-if="errors.password" class="text-xs text-(--color-danger)">{{ errors.password }}</p>
          </div>

          <!-- Confirmar senha -->
          <div class="flex flex-col gap-1.5">
            <label for="confirmPassword" class="text-sm font-medium text-(--color-text-secondary)">Confirmar senha</label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="Repita a senha"
              required
              :class="inputClass('confirmPassword')"
            />
            <p v-if="errors.confirmPassword" class="text-xs text-(--color-danger)">{{ errors.confirmPassword }}</p>
          </div>

          <!-- Erro geral -->
          <p v-if="generalError" class="text-sm text-(--color-danger) text-center bg-(--color-danger)/10 rounded-lg px-3 py-2">
            {{ generalError }}
          </p>

          <AppButton type="submit" variant="primary" :loading="loading" class="w-full mt-1">
            Criar conta
          </AppButton>
        </form>

        <!-- Divisor + Registro social -->
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
          Cadastrar com Google
        </a>

        <p class="text-center text-sm text-(--color-text-muted) mt-4">
          Já tem conta?
          <RouterLink to="/login" class="text-(--color-accent-amber) hover:underline font-medium">
            Entrar
          </RouterLink>
        </p>
      </div>
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Gamepad2, Eye, EyeOff, CheckCircle, Lock } from 'lucide-vue-next'
import AppButton from '@/shared/ui/AppButton.vue'
import { useAuth } from '@/shared/auth/useAuth'
import { useAuthStore } from '@/shared/auth/authStore'
import { getGoogleLoginUrl } from '../services/googleAuthService'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'

const { register } = useAuth()
const authStore = useAuthStore()
const featureFlags = useFeatureFlagsStore()
const registrationsEnabled = () => featureFlags.isEnabled('new_registrations')
const googleLoginUrl = getGoogleLoginUrl()

const form = reactive({ displayName: '', email: '', password: '', confirmPassword: '' })
const loading = ref(false)
const generalError = ref('')
const showPassword = ref(false)
const errors = reactive<Record<string, string>>({})
const registrationSuccess = ref(false)

function inputClass(field: string): string {
  const base = 'w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 transition-colors'
  return errors[field]
    ? `${base} border-(--color-danger) focus:ring-(--color-danger)/30`
    : `${base} border-transparent focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20`
}

function validate(): boolean {
  let valid = true
  Object.keys(errors).forEach((k) => delete errors[k])

  if (form.displayName.trim().length < 2) {
    errors.displayName = 'Nome deve ter pelo menos 2 caracteres.'
    valid = false
  }
  if (form.password.length < 8) {
    errors.password = 'Senha deve ter pelo menos 8 caracteres.'
    valid = false
  }
  if (form.password !== form.confirmPassword) {
    errors.confirmPassword = 'As senhas não coincidem.'
    valid = false
  }
  return valid
}

async function handleSubmit() {
  if (!validate()) return
  generalError.value = ''
  loading.value = true

  try {
    await register({
      displayName: form.displayName.trim(),
      email: form.email,
      password: form.password,
    })
    authStore.clearAuth()
    registrationSuccess.value = true
  } catch (err: any) {
    generalError.value = err.response?.data?.error ?? err.response?.data?.message ?? 'Erro ao criar conta. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>
