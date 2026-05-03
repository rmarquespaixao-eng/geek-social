import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'

interface AdminUser {
  id: string
  username: string
  email: string
  role: string
  avatar?: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const user = ref<AdminUser | null>(null)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'moderator')

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password })
    if (!['admin', 'moderator'].includes(data.user?.role)) {
      throw new Error('Acesso negado: perfil sem permissão de administrador')
    }
    token.value = data.accessToken
    user.value = data.user
    localStorage.setItem('admin_token', data.accessToken)
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      const { data } = await api.get('/users/me')
      if (!['admin', 'moderator'].includes(data.role)) {
        logout()
        return
      }
      user.value = data
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('admin_token')
  }

  return { token, user, isAuthenticated, isAdmin, login, fetchMe, logout }
})
