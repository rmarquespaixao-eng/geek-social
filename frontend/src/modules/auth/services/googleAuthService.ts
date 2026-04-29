import { api } from '@/shared/http/api'

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

/** URL para iniciar o login/registro com Google (público — redirecionar a janela inteira). */
export function getGoogleLoginUrl(): string {
  return `${API_BASE_URL}/auth/google`
}

/** Inicia o fluxo de vinculação (autenticado). Retorna a URL de autorização Google. */
export async function startGoogleLink(): Promise<string> {
  const { data } = await api.get<{ url: string }>('/auth/google/link')
  return data.url
}

export async function unlinkGoogle(): Promise<void> {
  await api.delete('/auth/google/link')
}
