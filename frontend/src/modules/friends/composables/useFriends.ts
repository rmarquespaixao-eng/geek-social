// src/modules/friends/composables/useFriends.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as svc from '../services/friendsService'
import type { Friend, FriendRequest, BlockedUser } from '../types'

export const useFriends = defineStore('friends', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const friends = ref<Friend[]>([])
  const receivedRequests = ref<FriendRequest[]>([])
  const sentRequests = ref<FriendRequest[]>([])
  const blockedUsers = ref<BlockedUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Computed ───────────────────────────────────────────────────────────────
  const pendingCount = computed(() => receivedRequests.value.length)

  const onlineFriends = computed(() =>
    friends.value.filter((f) => f.isOnline)
  )
  const offlineFriends = computed(() =>
    friends.value.filter((f) => !f.isOnline)
  )

  // ── Actions ────────────────────────────────────────────────────────────────
  async function fetchAll() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const [friendsList, received, sent, blocked] = await Promise.all([
        svc.listFriends(),
        svc.listReceived(),
        svc.listSent(),
        svc.listBlocked(),
      ])
      friends.value = friendsList
      receivedRequests.value = received
      sentRequests.value = sent
      blockedUsers.value = blocked
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao carregar amigos'
    } finally {
      loading.value = false
    }
  }

  async function acceptRequest(id: string) {
    try {
      await svc.acceptRequest(id)
      const req = receivedRequests.value.find((r) => r.id === id)
      receivedRequests.value = receivedRequests.value.filter((r) => r.id !== id)
      if (req) {
        // Otimisticamente adiciona à lista de amigos até o próximo fetchAll
        friends.value.push({
          id: req.senderId,
          displayName: req.senderName,
          avatarUrl: req.senderAvatarUrl,
          isOnline: false,
          lastSeenAt: null,
        })
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao aceitar pedido de amizade'
    }
  }

  async function rejectRequest(id: string) {
    try {
      await svc.rejectRequest(id)
      receivedRequests.value = receivedRequests.value.filter((r) => r.id !== id)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao recusar pedido de amizade'
    }
  }

  async function removeFriend(friendId: string) {
    try {
      await svc.removeFriend(friendId)
      friends.value = friends.value.filter((f) => f.id !== friendId)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao remover amigo'
    }
  }

  async function blockUser(userId: string) {
    try {
      await svc.blockUser(userId)
      // Remove da lista de amigos se for amigo
      const wasFriend = friends.value.find((f) => f.id === userId)
      friends.value = friends.value.filter((f) => f.id !== userId)
      // Remove pedidos pendentes envolvendo esse usuário
      receivedRequests.value = receivedRequests.value.filter(
        (r) => r.senderId !== userId
      )
      sentRequests.value = sentRequests.value.filter(
        (r) => r.receiverId !== userId
      )
      if (wasFriend) {
        blockedUsers.value.push({
          id: userId,
          displayName: wasFriend.displayName,
          avatarUrl: wasFriend.avatarUrl,
        })
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao bloquear usuário'
    }
  }

  async function unblockUser(userId: string) {
    try {
      await svc.unblockUser(userId)
      blockedUsers.value = blockedUsers.value.filter((b) => b.id !== userId)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao desbloquear usuário'
    }
  }

  async function sendRequest(receiverId: string) {
    try {
      const req = await svc.sendRequest(receiverId)
      sentRequests.value.push(req)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao enviar pedido de amizade'
    }
  }

  async function cancelRequest(requestId: string) {
    try {
      await svc.cancelRequest(requestId)
      sentRequests.value = sentRequests.value.filter((r) => r.id !== requestId)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao cancelar pedido'
    }
  }

  return {
    // state
    friends,
    receivedRequests,
    sentRequests,
    blockedUsers,
    loading,
    error,
    // computed
    pendingCount,
    onlineFriends,
    offlineFriends,
    // actions
    fetchAll,
    acceptRequest,
    rejectRequest,
    removeFriend,
    blockUser,
    unblockUser,
    sendRequest,
    cancelRequest,
  }
})
