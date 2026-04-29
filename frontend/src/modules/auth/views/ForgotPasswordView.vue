<template>
  <div class="min-h-screen flex items-center justify-center bg-(--color-bg-base) p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-(--color-bg-elevated) mb-4">
          <KeyRound :size="28" class="text-(--color-accent-amber)" />
        </div>
        <h1 class="text-2xl font-bold text-(--color-text-primary)">Recuperar senha</h1>
        <p class="text-(--color-text-secondary) mt-1 text-sm">
          Enviaremos um link de recuperação para o seu e-mail
        </p>
      </div>

      <div class="bg-(--color-bg-card) rounded-2xl p-6 shadow-xl border border-(--color-bg-elevated)">
        <!-- Formulário -->
        <form v-if="!sent" @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-(--color-text-secondary)">E-mail</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="seu@email.com"
              required
              class="w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border border-transparent text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20 transition-colors"
            />
          </div>

          <p v-if="error" class="text-sm text-(--color-danger) text-center bg-(--color-danger)/10 rounded-lg px-3 py-2">
            {{ error }}
          </p>

          <AppButton type="submit" variant="primary" :loading="loading" class="w-full">
            Enviar link de recuperação
          </AppButton>
        </form>

        <!-- Mensagem de sucesso -->
        <div v-else class="text-center py-4">
          <div class="w-12 h-12 rounded-full bg-(--color-status-online)/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle :size="28" class="text-(--color-status-online)" />
          </div>
          <p class="text-(--color-text-primary) font-medium">Link enviado!</p>
          <p class="text-(--color-text-secondary) text-sm mt-1">
            Verifique sua caixa de entrada em <span class="text-(--color-accent-amber)">{{ email }}</span>
          </p>
        </div>

        <p class="text-center text-sm text-(--color-text-muted) mt-4">
          <RouterLink to="/login" class="text-(--color-accent-amber) hover:underline font-medium">
            Voltar para o login
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { KeyRound, CheckCircle } from 'lucide-vue-next'
import AppButton from '@/shared/ui/AppButton.vue'
import * as authService from '../services/authService'

const email = ref('')
const loading = ref(false)
const error = ref('')
const sent = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    await authService.forgotPassword(email.value)
    sent.value = true
  } catch (err: any) {
    error.value = err.response?.data?.message ?? 'Erro ao enviar e-mail. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>
