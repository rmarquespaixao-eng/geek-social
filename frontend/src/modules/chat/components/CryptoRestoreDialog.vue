<script setup lang="ts">
import { ref, computed } from 'vue'
import { Lock, KeyRound } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import { useAuth } from '@/shared/auth/useAuth'
import { useAuthStore } from '@/shared/auth/authStore'
import { markCryptoSkipped } from '@/shared/auth/cryptoBootstrap'

const authStore = useAuthStore()
const auth = useAuth()

const pin = ref('')
const error = ref<string | null>(null)
const loading = ref(false)
// true = restore existing backup; false = create new PIN (OAuth first-time)
const isRestoreMode = computed(() => !!authStore.pendingCryptoRestore)

async function restore() {
  if (!pin.value || loading.value) return
  loading.value = true
  error.value = null
  try {
    const ok = await auth.restoreKeyFromBackup(pin.value)
    if (!ok) error.value = 'PIN incorreto. Verifique e tente novamente.'
  } finally {
    loading.value = false
  }
}

function skip() {
  const myId = authStore.user?.id
  if (myId) markCryptoSkipped(myId)
  authStore.clearPendingCryptoRestore()
  authStore.setPendingPinSetup(false)
}

async function createNew() {
  if (!pin.value || loading.value) return
  if (pin.value.length < 6) { error.value = 'O PIN deve ter pelo menos 6 caracteres.'; return }
  loading.value = true
  error.value = null
  try {
    const myId = authStore.user?.id
    if (!myId) return
    await auth.setupCryptoWithPin(myId, pin.value)
  } catch {
    error.value = 'Erro ao configurar PIN. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AppModal size="sm" @close="skip">
    <div class="flex flex-col items-center gap-4 p-2">
      <div class="w-12 h-12 rounded-full bg-(--color-accent-amber)/15 flex items-center justify-center">
        <Lock :size="22" class="text-(--color-accent-amber)" />
      </div>

      <template v-if="isRestoreMode">
        <h2 class="text-base font-semibold text-(--color-text-primary)">Restaurar chaves de criptografia</h2>
        <p class="text-sm text-(--color-text-muted) text-center">
          Insira seu PIN para recuperar o acesso às suas mensagens criptografadas neste dispositivo.
        </p>
      </template>
      <template v-else>
        <h2 class="text-base font-semibold text-(--color-text-primary)">Proteger mensagens</h2>
        <p class="text-sm text-(--color-text-muted) text-center">
          Crie um PIN para proteger suas chaves de criptografia. Você precisará dele ao acessar de um novo dispositivo.
        </p>
      </template>

      <input
        v-model="pin"
        type="password"
        :placeholder="isRestoreMode ? 'PIN de recuperação' : 'Criar PIN (mín. 6 caracteres)'"
        class="w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) border border-(--color-bg-surface) text-(--color-text-primary) text-sm focus:outline-none focus:border-(--color-accent-amber)/50 placeholder-gray-500"
        @keydown.enter="isRestoreMode ? restore() : createNew()"
        autocomplete="off"
      />

      <p v-if="error" class="text-xs text-(--color-danger) text-center">{{ error }}</p>

      <div class="flex gap-2 w-full">
        <AppButton variant="ghost" size="sm" class="flex-1" @click="skip">
          Pular
        </AppButton>
        <AppButton
          variant="primary"
          size="sm"
          class="flex-1"
          :loading="loading"
          :disabled="!pin"
          @click="isRestoreMode ? restore() : createNew()"
        >
          <KeyRound :size="14" class="mr-1" />
          {{ isRestoreMode ? 'Restaurar' : 'Salvar PIN' }}
        </AppButton>
      </div>

      <p class="text-[11px] text-(--color-text-muted) text-center">
        Ao pular, mensagens criptografadas não serão legíveis neste dispositivo.
      </p>
    </div>
  </AppModal>
</template>
