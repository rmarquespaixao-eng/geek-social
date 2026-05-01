import { storeToRefs } from 'pinia'
import { useAuthStore } from './authStore'
import { api } from '@/shared/http/api'
import type { LoginPayload, RegisterPayload, AuthResponse, User } from '@/shared/types/auth.types'
import { useRouter } from 'vue-router'
import { connectSocket, disconnectSocket } from '@/shared/socket/socket'
import { requestPushPermission } from '@/shared/pwa/usePush'
import * as cryptoService from '@/modules/chat/services/cryptoService'

export function useAuth() {
  const store = useAuthStore()
  const router = useRouter()
  const { user, token, isAuthenticated } = storeToRefs(store)

  async function login(payload: LoginPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/login', payload)
    store.setAuth(data.accessToken, { avatarUrl: null, ...data.user })
    // Carrega perfil completo (avatar, cover, bio, steamId, etc) — login só retorna o mínimo.
    await loadUser()
    connectSocket(data.accessToken)
    requestPushPermission().catch(() => {})
    initCrypto(store.user!.id, payload.password).catch(() => {})
  }

  async function register(payload: RegisterPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/register', payload)
    store.setAuth(data.accessToken, { avatarUrl: null, ...data.user })
    await loadUser()
    connectSocket(data.accessToken)
    initCrypto(store.user!.id, payload.password).catch(() => {})
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      cryptoService.clearKeyCache()
      disconnectSocket()
      store.clearAuth()
      router.push('/login')
    }
  }

  async function initCrypto(userId: string, password?: string): Promise<void> {
    const existingKey = await cryptoService.loadPrivateKey(userId)
    if (existingKey) return

    // Try to restore from server backup first
    let backup: cryptoService.EncryptedBackup | null = null
    try {
      const { data } = await api.get<cryptoService.EncryptedBackup>('/crypto/backup')
      backup = data
    } catch {
      // 404 = no backup yet
    }

    if (backup && password) {
      try {
        await cryptoService.importFromBackup(userId, backup, password)
        return
      } catch {
        // Wrong password or corrupted — fall through to generate new
      }
    }

    if (backup && !password) {
      // OAuth user: signal the UI to ask for the backup PIN
      store.setPendingCryptoRestore(backup)
      return
    }

    // No backup: generate fresh keypair and upload
    const publicKey = await cryptoService.initKeyPair(userId)
    await api.put('/crypto/my-key', { publicKey }).catch(() => {})

    if (password) {
      const encBackup = await cryptoService.exportEncryptedBackup(userId, password)
      await api.put('/crypto/backup', encBackup).catch(() => {})
    } else {
      // OAuth user with no backup: prompt to create a PIN
      store.setPendingPinSetup(true)
    }
  }

  async function restoreKeyFromBackup(password: string): Promise<boolean> {
    const backup = store.pendingCryptoRestore
    if (!backup || !store.user) return false
    try {
      await cryptoService.importFromBackup(store.user.id, backup, password)
      store.clearPendingCryptoRestore()
      return true
    } catch {
      return false
    }
  }

  async function setupCryptoWithPin(userId: string, pin: string): Promise<void> {
    const publicKey = await cryptoService.initKeyPair(userId)
    await api.put('/crypto/my-key', { publicKey }).catch(() => {})
    const encBackup = await cryptoService.exportEncryptedBackup(userId, pin)
    await api.put('/crypto/backup', encBackup).catch(() => {})
    store.clearPendingCryptoRestore()
    store.setPendingPinSetup(false)
  }

  async function loadUser(): Promise<void> {
    try {
      const { data } = await api.get<User>('/users/me')
      if (store.user) {
        store.setUser({ ...store.user, ...data })
      } else {
        store.setUser(data)
      }
    } catch {
      // 401 interceptor handles auth failures
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    login,
    register,
    logout,
    loadUser,
    initCrypto,
    restoreKeyFromBackup,
    setupCryptoWithPin,
  }
}
