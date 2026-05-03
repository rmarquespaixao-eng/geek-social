import type { AxiosError } from 'axios'
import { getActiveSignalSession } from '@/shared/crypto/signal/SignalClient'
import { api } from '@/shared/http/api'

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function is404(err: unknown): boolean {
  return (err as AxiosError | undefined)?.response?.status === 404
}

// ── Typed errors ────────────────────────────────────────────────────────────

export class CryptoNotReadyError extends Error {
  readonly code = 'CRYPTO_NOT_READY' as const
  constructor() {
    super('Signal session not initialized')
    this.name = 'CryptoNotReadyError'
  }
}

export class PeerHasNoKeysError extends Error {
  readonly code = 'PEER_NO_KEYS' as const
  readonly peerUserId: string
  constructor(peerUserId: string) {
    super(`Peer ${peerUserId} has no published prekey bundle`)
    this.name = 'PeerHasNoKeysError'
    this.peerUserId = peerUserId
  }
}

export function isReady(): boolean {
  return getActiveSignalSession() !== null
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Hex fingerprint of the local identity public key, grouped in 4-char chunks
 * for human comparison (e.g. matched against a peer's value over a side channel).
 * Returns null when the Signal session isn't initialized yet.
 */
export function getMyIdentityFingerprint(): string | null {
  const session = getActiveSignalSession()
  if (!session) return null
  const hex = bytesToHex(session.getIdentityPublicKey())
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex
}

/**
 * Re-export the local identity under a new password and replace the server-side
 * backup. Used by the settings UI when the user wants to set/rotate their backup PIN.
 */
export async function updateBackup(password: string): Promise<void> {
  const session = getActiveSignalSession()
  if (!session) throw new CryptoNotReadyError()
  const enc = await session.exportEncryptedBackup(password)
  await api.put('/crypto/backup', enc)
}

/**
 * Re-establish the Signal session with `peerUserId` by re-fetching their
 * prekey bundle. Useful when the local session is suspected broken or stale.
 * Note: only repairs FUTURE messages — past ciphertexts encrypted under the
 * old session remain undecryptable.
 *
 * Returns true if a fresh session was processed, false on any failure
 * (including 404 / IdentityChangedError — caller should handle those).
 */
export async function repairDmSession(peerUserId: string): Promise<boolean> {
  const session = getActiveSignalSession()
  if (!session) return false
  try {
    await session.processPrekeyBundleForRecipient(peerUserId)
    return true
  } catch {
    return false
  }
}

// ── DM (Signal session) ─────────────────────────────────────────────────────
// Wire: `${messageType}.${b64(body)}` (messageType: 1 = SignalMessage, 3 = PreKeySignalMessage)

export async function encryptDm(theirUserId: string, plaintext: string): Promise<string> {
  const session = getActiveSignalSession()
  if (!session) throw new CryptoNotReadyError()
  const had = await session.hasSession(theirUserId)
  if (!had) {
    try {
      await session.processPrekeyBundleForRecipient(theirUserId)
    } catch (err) {
      if (is404(err)) throw new PeerHasNoKeysError(theirUserId)
      throw err
    }
  }
  const { messageType, body } = await session.encryptMessage(
    theirUserId,
    new TextEncoder().encode(plaintext),
  )
  return `${messageType}.${bytesToB64(body)}`
}

// Throttle automatic session repair attempts so a corrupted session doesn't
// trigger one prekey-bundle fetch per message rendered. 30s is enough for the
// peer to publish fresh keys after a reset, short enough that the user doesn't
// stare at "[Mensagem criptografada]" for long.
const _lastRepairAt = new Map<string, number>()
const REPAIR_THROTTLE_MS = 30_000

/**
 * Bypass the auto-repair throttle for `peerUserId` so the next decryptDm call
 * can attempt repair again. Call this when the user explicitly clicks "retry"
 * on a failed message — the throttle exists to avoid background spam, not to
 * block intentional user action.
 */
export function clearRepairThrottle(peerUserId: string): void {
  _lastRepairAt.delete(peerUserId)
}

export async function decryptDm(senderUserId: string, ciphertext: string): Promise<string | null> {
  const session = getActiveSignalSession()
  if (!session) return null
  const dotIdx = ciphertext.indexOf('.')
  if (dotIdx === -1) return null
  const messageType = parseInt(ciphertext.slice(0, dotIdx), 10)
  if (!Number.isFinite(messageType)) return null
  const body = b64ToBytes(ciphertext.slice(dotIdx + 1))
  try {
    const plaintext = await session.decryptMessage(senderUserId, body, messageType)
    return new TextDecoder().decode(plaintext)
  } catch {
    // Auto-repair only helps when the local session is stale but the peer still
    // uses a compatible bundle. If the failure is because the ciphertext was
    // encrypted under prekeys we no longer have (e.g. backup didn't include
    // them), repair won't help — but it also won't make things worse.
    const now = Date.now()
    const lastRepair = _lastRepairAt.get(senderUserId) ?? 0
    if (now - lastRepair < REPAIR_THROTTLE_MS) return null
    _lastRepairAt.set(senderUserId, now)
    const repaired = await repairDmSession(senderUserId)
    if (!repaired) return null
    try {
      const plaintext = await session.decryptMessage(senderUserId, body, messageType)
      return new TextDecoder().decode(plaintext)
    } catch {
      return null
    }
  }
}

// ── Group (SenderKey) ───────────────────────────────────────────────────────
// distributionId == conversationId.
// Group message wire: `${b64(senderKeyMessageBody)}` — single message type.
// SKDM wire (per recipient, on /sender-key-distribution): `${messageType}.${b64(body)}`
//   (Signal session-encrypted wrapper around the raw SKDM bytes).

export async function encryptGroup(_conversationId: string, plaintext: string, senderKeyId: string): Promise<string | null> {
  const session = getActiveSignalSession()
  if (!session) return null
  try {
    const body = await session.encryptGroupMessage(
      senderKeyId,
      new TextEncoder().encode(plaintext),
    )
    return bytesToB64(body)
  } catch {
    return null
  }
}

export async function decryptGroup(
  senderUserId: string,
  conversationId: string,
  ciphertext: string,
): Promise<string | null> {
  const session = getActiveSignalSession()
  if (!session) {
    console.warn('[decryptGroup] no active Signal session', { senderUserId, conversationId })
    return null
  }
  let body: Uint8Array
  try {
    body = b64ToBytes(ciphertext)
  } catch (err) {
    console.error('[decryptGroup] b64 decode failed', err)
    return null
  }

  try {
    const plaintext = await session.decryptGroupMessage(senderUserId, body)
    return new TextDecoder().decode(plaintext)
  } catch (err1) {
    console.warn('[decryptGroup] first decrypt failed, will fetch SKDM', { senderUserId, err: err1 })
    const fetched = await fetchAndProcessSenderKey(conversationId, senderUserId)
    if (!fetched) {
      console.error('[decryptGroup] could not fetch/process SKDM', { senderUserId, conversationId })
      return null
    }
    try {
      const plaintext = await session.decryptGroupMessage(senderUserId, body)
      return new TextDecoder().decode(plaintext)
    } catch (err2) {
      console.error('[decryptGroup] retry after SKDM still failed', { senderUserId, err: err2 })
      return null
    }
  }
}

/**
 * Generate a fresh SKDM and upload one Signal-encrypted copy per recipient.
 * Skips recipients without an existing Signal session that cannot be bootstrapped.
 * Recipients that already have a session — or that have a publishable prekey bundle — are wrapped.
 * Returns the number of recipients successfully distributed to.
 */
export async function distributeSenderKey(
  conversationId: string,
  recipientUserIds: string[],
  senderKeyId: string,
): Promise<number> {
  const session = getActiveSignalSession()
  if (!session || recipientUserIds.length === 0) return 0

  const skdm = await session.createSenderKeyDistribution(senderKeyId)

  const distributions: Array<{ recipientUserId: string; ciphertext: string }> = []
  for (const recipientUserId of recipientUserIds) {
    try {
      if (!(await session.hasSession(recipientUserId))) {
        await session.processPrekeyBundleForRecipient(recipientUserId)
      }
      const { messageType, body } = await session.encryptMessage(recipientUserId, skdm)
      distributions.push({
        recipientUserId,
        ciphertext: `${messageType}.${bytesToB64(body)}`,
      })
    } catch {
      // Recipient has no published prekey bundle yet — skip; they can request later.
    }
  }

  if (distributions.length === 0) return 0
  await api.put(`/crypto/sender-key-distribution/${conversationId}`, { distributions })
  return distributions.length
}

async function fetchAndProcessSenderKey(
  conversationId: string,
  senderUserId: string,
): Promise<boolean> {
  const session = getActiveSignalSession()
  if (!session) return false
  let wrapped: string
  try {
    const { data } = await api.get<{ ciphertext: string }>(
      `/crypto/sender-key-distribution/${conversationId}/${senderUserId}`,
    )
    wrapped = data.ciphertext
  } catch {
    return false
  }
  const dotIdx = wrapped.indexOf('.')
  if (dotIdx === -1) return false
  const messageType = parseInt(wrapped.slice(0, dotIdx), 10)
  if (!Number.isFinite(messageType)) return false
  try {
    const body = b64ToBytes(wrapped.slice(dotIdx + 1))
    const skdm = await session.decryptMessage(senderUserId, body, messageType)
    await session.processSenderKeyDistribution(senderUserId, skdm, conversationId)
    return true
  } catch {
    return false
  }
}
