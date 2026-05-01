import { api } from '@/shared/http/api'
import { useAuthStore } from './authStore'
import { connectSocket } from '@/shared/socket/socket'
import { useNotifications } from '@/modules/notifications/composables/useNotifications'
import { usePresence } from '@/modules/chat/composables/usePresence'
import { useChat } from '@/modules/chat/composables/useChat'
import { useCall } from '@/modules/chat/composables/useCall'
import { useSteam } from '@/modules/integrations/steam/composables/useSteam'
import { initCrypto } from './cryptoBootstrap'
import type { User } from '@/shared/types/auth.types'

export async function initializeAuth(): Promise<void> {
  const store = useAuthStore()
  try {
    const { data: refreshData } = await api.post<{ accessToken: string }>('/auth/refresh')
    store.setToken(refreshData.accessToken)
    const { data: userData } = await api.get<User>('/users/me')
    store.setUser(userData)
    connectSocket(refreshData.accessToken)
    await initCrypto(userData.id)
    const notificationsStore = useNotifications()
    const presenceStore = usePresence()
    const chatStore = useChat()
    const callStore = useCall()
    notificationsStore.fetchAll()
    chatStore.fetchConversations()
    chatStore.fetchArchivedConversations(true)
    const steamStore = useSteam()
    setTimeout(() => {
      notificationsStore.init()
      presenceStore.init()
      chatStore.init()
      callStore.initSocketListeners()
      steamStore.init()
    }, 500)
  } catch {
    store.clearAuth()
  }
}
