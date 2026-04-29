// src/modules/chat/composables/useFloatingChats.ts
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Router } from 'vue-router'
import { useChat } from './useChat'

type FloatingWindow = { id: string; minimized: boolean }

const MAX_WINDOWS = 4
const DESKTOP_QUERY = '(min-width: 768px)'

function isDesktop(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia(DESKTOP_QUERY).matches
}

export const useFloatingChats = defineStore('floatingChats', () => {
  const chat = useChat()
  const windows = ref<FloatingWindow[]>([])

  /** Conversa atualmente expandida (apenas uma por vez). */
  const expanded = computed(() => windows.value.find((w) => !w.minimized) ?? null)

  /** Janelas minimizadas (chips). */
  const minimizedWindows = computed(() => windows.value.filter((w) => w.minimized))

  /**
   * Adiciona/expande a conversa na lista. Se já existir, traz para expandida.
   * Se for nova e ultrapassar MAX_WINDOWS, descarta a minimizada mais antiga.
   */
  function addOrExpand(conversationId: string): void {
    const existing = windows.value.find((w) => w.id === conversationId)
    if (existing) {
      if (existing.minimized) {
        windows.value = windows.value.map((w) => ({ ...w, minimized: w.id !== conversationId }))
      }
      return
    }
    const next: FloatingWindow[] = windows.value.map((w) => ({ ...w, minimized: true }))
    next.push({ id: conversationId, minimized: false })
    while (next.length > MAX_WINDOWS) {
      const idx = next.findIndex((w) => w.minimized)
      if (idx === -1) break
      next.splice(idx, 1)
    }
    windows.value = next
  }

  /**
   * Promove TODA conversa ativada (de qualquer ponto da UI: triggers diretos
   * em friends/profile, clique no `ConversationList` dentro de /chat, abertura
   * direta via URL `/chat/:id`) para a barra flutuante. Quando o usuário sair
   * de /chat a janela já estará aqui esperando.
   */
  watch(() => chat.activeConversationId, (id) => {
    if (!id) return
    addOrExpand(id)
  }, { immediate: true })

  /**
   * Decide entre janela flutuante (desktop) ou navegação (mobile).
   * Triggers em FriendItem/OnlineFriendTile/ProfileView chamam isto após
   * `chat.openDm()` — desktop é no-op porque o watch acima já adicionou.
   */
  async function openOrRoute(conversationId: string, router: Router): Promise<void> {
    if (isDesktop()) return
    await router.push(`/chat/${conversationId}`)
  }

  function closeChat(conversationId: string): void {
    const wasExpanded = windows.value.find((w) => w.id === conversationId)?.minimized === false
    windows.value = windows.value.filter((w) => w.id !== conversationId)
    if (wasExpanded && windows.value.length > 0) {
      windows.value[windows.value.length - 1].minimized = false
      void chat.setActiveConversation(windows.value[windows.value.length - 1].id)
    } else if (windows.value.length === 0 && chat.activeConversationId === conversationId) {
      chat.leaveActiveConversation()
    }
  }

  function minimizeChat(conversationId: string): void {
    const w = windows.value.find((x) => x.id === conversationId)
    if (!w) return
    w.minimized = true
    if (chat.activeConversationId === conversationId) chat.leaveActiveConversation()
  }

  async function expandChat(conversationId: string): Promise<void> {
    windows.value = windows.value.map((w) => ({ ...w, minimized: w.id !== conversationId }))
    await chat.setActiveConversation(conversationId)
  }

  function clear(): void {
    windows.value = []
  }

  return {
    windows,
    expanded,
    minimizedWindows,
    openOrRoute,
    closeChat,
    minimizeChat,
    expandChat,
    clear,
  }
})
