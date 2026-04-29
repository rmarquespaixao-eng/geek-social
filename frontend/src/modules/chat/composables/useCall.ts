import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import { sendCallMessage } from '../services/chatService'
import type { CallStatus } from '../types'

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'active' | 'ended'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
]

const RING_TIMEOUT_MS = 30_000

export const useCall = defineStore('call', () => {
  const state = ref<CallState>('idle')
  const callId = ref<string | null>(null)
  const conversationId = ref<string | null>(null)
  const peer = ref<{ userId: string; displayName: string; avatarUrl: string | null } | null>(null)
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const micMuted = ref(false)
  const camMuted = ref(false)
  const startedAt = ref<Date | null>(null)
  const errorMessage = ref<string | null>(null)
  const isInitiator = ref(false)

  let pc: RTCPeerConnection | null = null
  let inviteTimeoutId: number | null = null
  let pendingIce: RTCIceCandidateInit[] = []
  let remoteDescSet = false

  function ensureSocket() {
    const s = getSocket()
    if (!s) throw new Error('SOCKET_NOT_CONNECTED')
    return s
  }

  function buildPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    conn.onicecandidate = (e) => {
      if (e.candidate && callId.value) {
        ensureSocket().emit('call:signal', {
          callId: callId.value,
          type: 'ice',
          payload: e.candidate.toJSON(),
        })
      }
    }
    conn.ontrack = (e) => {
      remoteStream.value = e.streams[0] ?? new MediaStream([e.track])
    }
    conn.onconnectionstatechange = () => {
      if (!conn) return
      if (conn.connectionState === 'connected' && state.value === 'connecting') {
        state.value = 'active'
        startedAt.value = new Date()
      }
      if (conn.connectionState === 'failed') {
        void finalize('failed')
      }
    }
    return conn
  }

  async function getMedia(): Promise<MediaStream> {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  }

  async function invite(convId: string, peerInfo: { userId: string; displayName: string; avatarUrl: string | null }) {
    if (state.value !== 'idle') return
    errorMessage.value = null
    try {
      localStream.value = await getMedia()
    } catch {
      errorMessage.value = 'Permissão de câmera/microfone negada.'
      return
    }
    callId.value = crypto.randomUUID()
    conversationId.value = convId
    peer.value = peerInfo
    isInitiator.value = true
    state.value = 'calling'
    ensureSocket().emit('call:invite', { conversationId: convId, callId: callId.value })

    inviteTimeoutId = window.setTimeout(() => {
      if (state.value === 'calling') {
        ensureSocket().emit('call:cancel', { callId: callId.value })
        void finalize('missed')
      }
    }, RING_TIMEOUT_MS)
  }

  async function accept() {
    if (state.value !== 'ringing' || !callId.value) return
    if (inviteTimeoutId !== null) { clearTimeout(inviteTimeoutId); inviteTimeoutId = null }
    try {
      localStream.value = await getMedia()
    } catch {
      reject()
      return
    }
    isInitiator.value = false
    state.value = 'connecting'
    pc = buildPeerConnection()
    for (const t of localStream.value.getTracks()) pc.addTrack(t, localStream.value)
    ensureSocket().emit('call:accept', { callId: callId.value })
  }

  function reject() {
    if (state.value !== 'ringing' || !callId.value) return
    ensureSocket().emit('call:reject', { callId: callId.value })
    void finalize('rejected', false)
  }

  function cancel() {
    if (state.value !== 'calling' || !callId.value) return
    ensureSocket().emit('call:cancel', { callId: callId.value })
    void finalize('cancelled')
  }

  function hangup() {
    if (state.value !== 'active' && state.value !== 'connecting') return
    if (callId.value) {
      const dur = startedAt.value ? Math.floor((Date.now() - startedAt.value.getTime()) / 1000) : 0
      ensureSocket().emit('call:end', { callId: callId.value, durationSec: dur })
    }
    void finalize(startedAt.value ? 'completed' : 'cancelled')
  }

  function endCall() {
    if (state.value === 'calling') return cancel()
    if (state.value === 'ringing') return reject()
    if (state.value === 'active' || state.value === 'connecting') return hangup()
  }

  function toggleMic() {
    if (!localStream.value) return
    micMuted.value = !micMuted.value
    for (const t of localStream.value.getAudioTracks()) t.enabled = !micMuted.value
  }

  function toggleCam() {
    if (!localStream.value) return
    camMuted.value = !camMuted.value
    for (const t of localStream.value.getVideoTracks()) t.enabled = !camMuted.value
  }

  async function finalize(status: CallStatus, persist = true) {
    if (inviteTimeoutId !== null) {
      clearTimeout(inviteTimeoutId)
      inviteTimeoutId = null
    }
    const endedAt = new Date()
    const duration = startedAt.value ? Math.floor((endedAt.getTime() - startedAt.value.getTime()) / 1000) : 0
    const initiatorId = isInitiator.value ? await getSelfId() : peer.value?.userId ?? ''
    const convIdForPersist = conversationId.value

    if (persist && isInitiator.value && convIdForPersist) {
      try {
        await sendCallMessage(convIdForPersist, {
          status,
          durationSec: duration,
          startedAt: (startedAt.value ?? endedAt).toISOString(),
          endedAt: endedAt.toISOString(),
          initiatorId,
        })
      } catch (e) {
        console.error('Failed to persist call message', e)
      }
    }

    cleanup()
  }

  function cleanup() {
    if (pc) {
      try { pc.close() } catch { /* ignore */ }
      pc = null
    }
    if (localStream.value) {
      for (const t of localStream.value.getTracks()) t.stop()
    }
    localStream.value = null
    remoteStream.value = null
    callId.value = null
    conversationId.value = null
    peer.value = null
    startedAt.value = null
    micMuted.value = false
    camMuted.value = false
    isInitiator.value = false
    pendingIce = []
    remoteDescSet = false
    state.value = 'idle'
  }

  async function getSelfId(): Promise<string> {
    try {
      const mod = await import('@/shared/auth/authStore')
      return mod.useAuthStore().user?.id ?? ''
    } catch {
      return ''
    }
  }

  function initSocketListeners() {
    const s = ensureSocket()

    s.on('call:incoming', (data: { callId: string; conversationId: string; fromUserId: string; fromName: string; fromAvatar: string | null }) => {
      if (state.value !== 'idle') {
        s.emit('call:reject', { callId: data.callId })
        return
      }
      callId.value = data.callId
      conversationId.value = data.conversationId
      peer.value = { userId: data.fromUserId, displayName: data.fromName, avatarUrl: data.fromAvatar }
      isInitiator.value = false
      state.value = 'ringing'
      inviteTimeoutId = window.setTimeout(() => {
        if (state.value === 'ringing') cleanup()
      }, RING_TIMEOUT_MS)
    })

    s.on('call:accepted', async (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      if (inviteTimeoutId !== null) { clearTimeout(inviteTimeoutId); inviteTimeoutId = null }
      state.value = 'connecting'
      pc = buildPeerConnection()
      if (localStream.value) {
        for (const t of localStream.value.getTracks()) pc.addTrack(t, localStream.value)
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      s.emit('call:signal', { callId: data.callId, type: 'offer', payload: offer })
    })

    s.on('call:rejected', (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      void finalize('rejected')
    })

    s.on('call:cancelled', (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      void finalize('cancelled', false)
    })

    s.on('call:ended', (data: { callId: string; durationSec: number }) => {
      if (callId.value !== data.callId) return
      void finalize(startedAt.value ? 'completed' : 'cancelled')
    })

    s.on('call:peer-gone', (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      void finalize(startedAt.value ? 'completed' : 'failed')
    })

    s.on('call:failed', (data: { callId: string; code: string }) => {
      if (callId.value !== data.callId) return
      errorMessage.value = `Falha: ${data.code}`
      void finalize('failed', false)
    })

    s.on('call:signal', async (data: { callId: string; type: 'offer' | 'answer' | 'ice'; payload: any }) => {
      if (callId.value !== data.callId || !pc) return
      if (data.type === 'offer') {
        await pc.setRemoteDescription(data.payload)
        remoteDescSet = true
        for (const c of pendingIce) await pc.addIceCandidate(c).catch(() => { /* ignore */ })
        pendingIce = []
        const ans = await pc.createAnswer()
        await pc.setLocalDescription(ans)
        s.emit('call:signal', { callId: data.callId, type: 'answer', payload: ans })
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(data.payload)
        remoteDescSet = true
        for (const c of pendingIce) await pc.addIceCandidate(c).catch(() => { /* ignore */ })
        pendingIce = []
      } else if (data.type === 'ice') {
        if (remoteDescSet) {
          await pc.addIceCandidate(data.payload).catch(() => { /* ignore */ })
        } else {
          pendingIce.push(data.payload)
        }
      }
    })
  }

  return {
    state, callId, peer, localStream, remoteStream, micMuted, camMuted,
    startedAt, errorMessage, isInitiator,
    invite, accept, reject, cancel, hangup, endCall, toggleMic, toggleCam,
    initSocketListeners,
  }
})
