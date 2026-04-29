import { storeToRefs } from 'pinia'
import { useAuthStore } from './authStore'
import { api } from '@/shared/http/api'
import type { LoginPayload, RegisterPayload, AuthResponse, User } from '@/shared/types/auth.types'
import { useRouter } from 'vue-router'
import { connectSocket, disconnectSocket } from '@/shared/socket/socket'
import { requestPushPermission } from '@/shared/pwa/usePush'

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
  }

  async function register(payload: RegisterPayload): Promise<void> {
    const { data } = await api.post<AuthResponse>('/auth/register', payload)
    store.setAuth(data.accessToken, { avatarUrl: null, ...data.user })
    await loadUser()
    connectSocket(data.accessToken)
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      disconnectSocket()
      store.clearAuth()
      router.push('/login')
    }
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
  }
}
