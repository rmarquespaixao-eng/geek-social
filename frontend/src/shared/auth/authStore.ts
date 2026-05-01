import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/shared/types/auth.types'
import type { EncryptedSignalBackup } from '@/shared/crypto/signal/SignalClient'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const pendingCryptoRestore = ref<EncryptedSignalBackup | null>(null)
  const pendingPinSetup = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  function setAuth(newToken: string, newUser: User) {
    token.value = newToken
    user.value = newUser
  }

  function setToken(newToken: string) {
    token.value = newToken
  }

  function setUser(newUser: User) {
    user.value = newUser
  }

  function clearAuth() {
    token.value = null
    user.value = null
    pendingCryptoRestore.value = null
    pendingPinSetup.value = false
  }

  function setPendingCryptoRestore(backup: EncryptedSignalBackup) {
    pendingCryptoRestore.value = backup
  }

  function clearPendingCryptoRestore() {
    pendingCryptoRestore.value = null
  }

  function setPendingPinSetup(v: boolean) {
    pendingPinSetup.value = v
  }

  return {
    user, token, isAuthenticated, pendingCryptoRestore, pendingPinSetup,
    setAuth, setToken, setUser, clearAuth,
    setPendingCryptoRestore, clearPendingCryptoRestore, setPendingPinSetup,
  }
})
