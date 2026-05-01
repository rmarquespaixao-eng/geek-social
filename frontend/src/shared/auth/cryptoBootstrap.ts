import type { AxiosError } from 'axios'
import { api } from '@/shared/http/api'
import { useAuthStore } from './authStore'
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
 * 1. Local IndexedDB has identity → restore client; if server is missing identity,
 *    re-publish ours (recovers users whose original publish failed).
 * 2. No local identity, server has backup → if password works, restore + publish
 *    fresh prekeys; otherwise stash backup for the PIN restore dialog.
 * 3. No local identity, no backup, server has identity → orphaned: cannot
 *    regenerate without invalidating peers' sessions, so prompt PIN setup so the
 *    user sees the broken state instead of silently overwriting.
 * 4. Fresh user (nothing anywhere) → generate locally, publish, and either back
 *    up under the login password or prompt a PIN to set one.
 *
 * All network errors propagate to the caller — the previous .catch(() => {})
 * variant masked silent publish failures and was the root cause of users with
 * 0 keys on the server.
 */
export async function initCrypto(userId: string, password?: string): Promise<void> {
  const store = useAuthStore()

  const localMeta = await peekLocalSignalMeta(userId)

  if (localMeta) {
    const session = await initSignalClient(userId)
    if (!(await serverHasIdentity(userId))) {
      // Server lost our identity — republish refreshes every key so we don't
      // also need a separate maintenance pass.
      await session.publishKeys()
    } else {
      // Fire-and-forget: rotate stale SPK/Kyber and refill OTPs in the
      // background so login latency isn't tied to the maintenance round-trips.
      void session.runKeyMaintenance().catch((err: unknown) => {
        console.warn('[crypto] key maintenance failed', err)
      })
    }
    return
  }

  const backup = await fetchServerBackup()

  if (backup) {
    if (password) {
      try {
        const restored = await SignalSession.loadFromBackup(userId, backup, password)
        await adoptRestoredSession(restored)
        await restored.publishKeys()
        return
      } catch {
        // Login password ≠ backup password. Don't regenerate (would orphan
        // every prior ciphertext addressed to the old identity); fall through
        // to the restore dialog so the user can enter the original PIN.
      }
    }
    store.setPendingCryptoRestore(backup)
    return
  }

  if (await serverHasIdentity(userId)) {
    // Server has an identity but we have no local key and no backup.
    // Regenerating here would invalidate every session peers have with us;
    // surface the broken state via the PIN dialog instead.
    store.setPendingPinSetup(true)
    return
  }

  const session = await initSignalClient(userId)
  await session.publishKeys()

  if (password) {
    const enc = await session.exportEncryptedBackup(password)
    await api.put('/crypto/backup', enc)
  } else {
    store.setPendingPinSetup(true)
  }
}
