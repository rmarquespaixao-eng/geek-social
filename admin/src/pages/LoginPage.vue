<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    router.push('/')
  } catch (e: any) {
    error.value = e.response?.data?.message || e.message || 'Credenciais inválidas'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-900 p-4">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl">G</div>
        <h1 class="text-2xl font-bold text-white">GeekSocial Admin</h1>
        <p class="mt-1 text-slate-400">Acesso restrito a administradores</p>
      </div>

      <Card>
        <CardContent class="p-6">
          <form @submit.prevent="submit" class="space-y-4">
            <div class="space-y-1.5">
              <Label for="email">E-mail</Label>
              <Input id="email" v-model="email" type="email" placeholder="admin@geeksocial.com" :disabled="loading" />
            </div>
            <div class="space-y-1.5">
              <Label for="password">Senha</Label>
              <Input id="password" v-model="password" type="password" placeholder="••••••••" :disabled="loading" />
            </div>
            <div v-if="error" class="rounded-md bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>
            <Button type="submit" class="w-full" :disabled="loading || !email || !password">
              {{ loading ? 'Entrando...' : 'Entrar' }}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
