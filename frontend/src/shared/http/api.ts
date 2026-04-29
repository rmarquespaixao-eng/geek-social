import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { useAuthStore } from '@/shared/auth/authStore'

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
})

// Injeta Authorization header com token em memória
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const store = useAuthStore()
  if (store.token && config.headers) {
    config.headers.Authorization = `Bearer ${store.token}`
  }
  return config
})

// Em 401: tenta refresh silencioso, repete request original; em falha, redireciona ao login
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (!originalRequest) return Promise.reject(error)

    if (error.response?.status !== 401) return Promise.reject(error)
    if (originalRequest._retry) return Promise.reject(error)
    if (originalRequest.url?.includes('/auth/refresh')) return Promise.reject(error)

    originalRequest._retry = true
    const store = useAuthStore()

    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/refresh')
      store.setToken(data.accessToken)
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
      }
      return api(originalRequest)
    } catch {
      store.clearAuth()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
  },
)
