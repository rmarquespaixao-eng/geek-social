import type { AxiosError } from 'axios'
import { api } from '@/shared/http/api'
import {
  SignalSession,
  adoptRestoredSession,
  initSignalClient,
  peekLocalSignalMeta,
  type EncryptedSignalBackup,
} from '@/shared/crypto/signal/SignalClient'

function is404(err: unknown): boolean {
  return (err as AxiosError | undefined)?.response?.status === 404
}

async function fetchServerBackup(): Promise<EncryptedSignalBackup | null> {
  try {
    const { data } = await api.get<EncryptedSignalBackup>('/crypto/backup')
    return data
  } catch (err) {
    if (is404(err)) return null
    throw err
  }
}

async function serverHasIdentity(userId: string): Promise<boolean> {
  try {
    await api.get(`/crypto/identity/${userId}`)
    return true
  } catch (err) {
    if (is404(err)) return false
    throw err
  }
}

/**
 * Bootstraps the Signal client for the logged-in user.
 *
 * Flow:
 * 1. IDB has keys → load silently, no user input needed.
 * 2. IDB empty + login password → try auto-restore from server backup (transparent).
 *    On success, republish prekeys. On failure (wrong password), fall through.
 * 3. No restorable backup → generate fresh identity and publish.
 *    Backup saved with login password so a future same-password login auto-recovers.
 *
 * No PIN dialogs. If IDB is cleared without a restorable backup, a fresh identity
 * is generated automatically — old ciphertexts become unreadable (same trade-off
 * as WhatsApp Web on browser data clear).
 */
export async function initCrypto(userId: string, password?: string): Promise<void> {
  const localMeta = await peekLocalSignalMeta(userId)

  if (localMeta) {
    const session = await initSignalClient(userId)
    if (!(await serverHasIdentity(userId))) {
      await session.publishKeys()
    } else {
      void session.runKeyMaintenance().catch((err: unknown) => {
        console.warn('[crypto] key maintenance failed', err)
      })
    }
    return
  }

  // IDB empty — try transparent restore from server backup using login password
  if (password) {
    const backup = await fetchServerBackup()
    if (backup) {
      try {
        const restored = await SignalSession.loadFromBackup(userId, backup, password)
        await adoptRestoredSession(restored)
        await restored.publishKeys()
        return
      } catch {
        // Backup was encrypted with a different password — fall through to fresh identity
      }
    }
  }

  // Generate fresh identity
  const session = await initSignalClient(userId)
  await session.publishKeys()

  // Best-effort backup with login password for transparent auto-restore on next device
  if (password) {
    try {
      const enc = await session.exportEncryptedBackup(password)
      await api.put('/crypto/backup', enc)
    } catch {
      // Non-critical
    }
  }
}
