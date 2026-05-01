import { storeToRefs } from 'pinia'
import { useAuthStore } from './authStore'
import { api } from '@/shared/http/api'
import type { LoginPayload, RegisterPayload, AuthResponse, User } from '@/shared/types/auth.types'
import { useRouter } from 'vue-router'
import { connectSocket, disconnectSocket } from '@/shared/socket/socket'
import { requestPushPermission } from '@/shared/pwa/usePush'
import {
  SignalSession,
  adoptRestoredSession,
  initSignalClient,
  resetSignalSession,
} from '@/shared/crypto/signal/SignalClient'
import { initCrypto, clearCryptoSkipped } from './cryptoBootstrap'

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
    await initCrypto(store.user!.id, payload.password)
  }

  async function register(payload: RegisterPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/register', payload)
    store.setAuth(data.accessToken, { avatarUrl: null, ...data.user })
    await loadUser()
    connectSocket(data.accessToken)
    await initCrypto(store.user!.id, payload.password)
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      const myId = store.user?.id
      if (myId) clearCryptoSkipped(myId)
      resetSignalSession()
      disconnectSocket()
      store.clearAuth()
      router.push('/login')
    }
  }

  async function restoreKeyFromBackup(password: string): Promise<boolean> {
    const backup = store.pendingCryptoRestore
    if (!backup || !store.user) return false
    try {
      const restored = await SignalSession.loadFromBackup(store.user.id, backup, password)
      await adoptRestoredSession(restored)
      // Old prekeys/sessions are gone after a restore — publish a fresh batch
      // so peers can keep starting new conversations with us.
      await restored.publishKeys()
      clearCryptoSkipped(store.user.id)
      store.clearPendingCryptoRestore()
      return true
    } catch {
      return false
    }
  }

  async function setupCryptoWithPin(userId: string, pin: string): Promise<void> {
    const session = await initSignalClient(userId)

    // If we never managed to publish during initCrypto (offline, transient 5xx),
    // the local identity exists but the server doesn't know about it. Catch up now.
    let needsPublish = false
    try {
      await api.get(`/crypto/identity/${userId}`)
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) {
        needsPublish = true
      } else {
        throw err
      }
    }
    if (needsPublish) await session.publishKeys()

    const enc = await session.exportEncryptedBackup(pin)
    await api.put('/crypto/backup', enc)
    clearCryptoSkipped(userId)
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
