import init, {
  SignalClient as WasmSignalClient,
  type WasmCiphertext,
  type WasmPreKey,
  type WasmSafetyNumber,
} from '@getmaapp/signal-wasm'
import { api } from '@/shared/http/api'

const DEVICE_ID = 1
const PREKEY_BATCH = 100
const ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const OTP_REFILL_THRESHOLD = 20
const DB_NAME = 'geek-signal-v1'
const DB_VERSION = 2

const STORE_META = 'meta'
const STORE_PREKEYS = 'prekeys'
const STORE_SIGNED_PREKEYS = 'signedPrekeys'
const STORE_KYBER_PREKEYS = 'kyberPrekeys'
const STORE_SESSIONS = 'sessions'
const STORE_SENDER_KEYS = 'senderKeys'
const STORE_IDENTITIES = 'identities'

const ALL_STORES = [
  STORE_META,
  STORE_PREKEYS,
  STORE_SIGNED_PREKEYS,
  STORE_KYBER_PREKEYS,
  STORE_SESSIONS,
  STORE_SENDER_KEYS,
  STORE_IDENTITIES,
] as const

// ── b64 helpers ───────────────────────────────────────────────────────────

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

// ── IndexedDB ─────────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'userId' })
      }
      for (const s of [
        STORE_PREKEYS,
        STORE_SIGNED_PREKEYS,
        STORE_KYBER_PREKEYS,
        STORE_SESSIONS,
        STORE_SENDER_KEYS,
        STORE_IDENTITIES,
      ]) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: 'key' })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

interface MetaRecord {
  userId: string
  identityPublicKey: Uint8Array
  identityPrivateKey: Uint8Array
  registrationId: number
  deviceId: number
  nextPrekeyId: number
  nextSignedPrekeyId: number
  nextKyberPrekeyId: number
  bootstrappedAt: number
  lastSpkRotation?: number
  lastKyberRotation?: number
}

interface PrekeyRow {
  key: string
  userId: string
  id: number
  record: Uint8Array
}

interface SessionRow {
  key: string
  userId: string
  contactUuid: string
  deviceId: number
  record: Uint8Array
}

interface SenderKeyRow {
  key: string
  userId: string
  memberUuid: string
  deviceId: number
  distributionId: string
  record: Uint8Array
}

interface IdentityRow {
  key: string
  userId: string
  contactUuid: string
  identityKey: Uint8Array
  firstSeenAt: number
  status: 'trusted' | 'pending'
  pendingNewKey?: Uint8Array
  pendingDetectedAt?: number
}

function txGet<T = unknown>(store: string, key: IDBValidKey): Promise<T | null> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = () => resolve((req.result ?? null) as T | null)
    req.onerror = () => reject(req.error)
  }))
}

function txPut(store: string, value: unknown): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

function txListByUserId<T extends { userId: string }>(store: string, userId: string): Promise<T[]> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const out: T[] = []
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return resolve(out)
      const v = cursor.value as T
      if (v.userId === userId) out.push(v)
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  }))
}

function txDelete(store: string, key: IDBValidKey): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

function txDeleteByUserId(store: string, userId: string): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objStore = tx.objectStore(store)
    const req = objStore.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return
      const v = cursor.value as { userId?: string }
      if (v.userId === userId) cursor.delete()
      cursor.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

// ── WASM init (idempotent, lazy) ─────────────────────────────────────────

let _wasmReady: Promise<void> | null = null

function ensureWasm(): Promise<void> {
  if (!_wasmReady) {
    _wasmReady = (async () => { await init() })()
  }
  return _wasmReady
}

// ── Backup payload (JSON encrypted with PBKDF2 + AES-GCM) ─────────────────

export interface EncryptedSignalBackup {
  encryptedBackup: string
  backupSalt: string
  backupIv: string
}

interface BackupPlaintext {
  identityPublicKey: string
  identityPrivateKey: string
  registrationId: number
  deviceId: number
}

const PBKDF2_ITERATIONS = 600_000

async function deriveBackupKey(password: string, salt: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

// ── Identity change detection (TOFU) ─────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export class IdentityChangedError extends Error {
  readonly contactUuid: string
  readonly oldKey: Uint8Array
  readonly newKey: Uint8Array
  constructor(contactUuid: string, oldKey: Uint8Array, newKey: Uint8Array) {
    super(`Identity changed for ${contactUuid}`)
    this.name = 'IdentityChangedError'
    this.contactUuid = contactUuid
    this.oldKey = oldKey
    this.newKey = newKey
  }
}

export interface PendingIdentityChange {
  contactUuid: string
  oldKey: Uint8Array
  newKey: Uint8Array
  detectedAt: number
}

type IdentityListener = (change: PendingIdentityChange) => void
const _identityListeners = new Set<IdentityListener>()

export function onIdentityChange(listener: IdentityListener): () => void {
  _identityListeners.add(listener)
  return () => {
    _identityListeners.delete(listener)
  }
}

function emitIdentityChange(change: PendingIdentityChange): void {
  for (const fn of _identityListeners) {
    try {
      fn(change)
    } catch {
      // listener errors must not break crypto flow
    }
  }
}

// ── SignalSession ────────────────────────────────────────────────────────

export class SignalSession {
  readonly userId: string
  private inner: WasmSignalClient

  private constructor(userId: string, inner: WasmSignalClient) {
    this.userId = userId
    this.inner = inner
  }

  /**
   * Restore from local IndexedDB if present, otherwise create a fresh client and persist.
   * Does NOT publish to server — call `publishKeys()` explicitly.
   */
  static async load(userId: string): Promise<SignalSession> {
    await ensureWasm()
    const meta = await txGet<MetaRecord>(STORE_META, userId)

    if (meta) {
      const inner = WasmSignalClient.restore(
        meta.identityPublicKey,
        meta.identityPrivateKey,
        meta.registrationId,
        userId,
        meta.deviceId,
        meta.nextPrekeyId,
        meta.nextSignedPrekeyId,
        meta.nextKyberPrekeyId,
      )
      // Re-import all stored records into the fresh in-memory stores.
      const [prekeys, signed, kyber, sessions, senderKeys] = await Promise.all([
        txListByUserId<PrekeyRow>(STORE_PREKEYS, userId),
        txListByUserId<PrekeyRow>(STORE_SIGNED_PREKEYS, userId),
        txListByUserId<PrekeyRow>(STORE_KYBER_PREKEYS, userId),
        txListByUserId<SessionRow>(STORE_SESSIONS, userId),
        txListByUserId<SenderKeyRow>(STORE_SENDER_KEYS, userId),
      ])
      for (const p of prekeys) await inner.import_pre_key(p.id, p.record)
      for (const p of signed) await inner.import_signed_pre_key(p.id, p.record)
      for (const p of kyber) await inner.import_kyber_pre_key(p.id, p.record)
      for (const s of sessions) await inner.import_session(s.contactUuid, s.deviceId, s.record)
      for (const sk of senderKeys) {
        await inner.import_sender_key(sk.memberUuid, sk.deviceId, sk.distributionId, sk.record)
      }
      return new SignalSession(userId, inner)
    }

    const inner = new WasmSignalClient(userId, DEVICE_ID)
    const idKp = inner.get_identity_key_pair()
    await txPut(STORE_META, {
      userId,
      identityPublicKey: idKp.public_key,
      identityPrivateKey: idKp.private_key,
      registrationId: inner.get_registration_id(),
      deviceId: inner.get_local_device_id(),
      nextPrekeyId: inner.get_next_pre_key_id(),
      nextSignedPrekeyId: inner.get_next_signed_pre_key_id(),
      nextKyberPrekeyId: inner.get_next_kyber_pre_key_id(),
      bootstrappedAt: Date.now(),
    } satisfies MetaRecord)
    return new SignalSession(userId, inner)
  }

  /**
   * Restore identity from an encrypted server backup, replacing any local meta.
   * Sessions/prekeys are NOT recovered — caller must publish a fresh batch.
   */
  static async loadFromBackup(
    userId: string,
    backup: EncryptedSignalBackup,
    password: string,
  ): Promise<SignalSession> {
    await ensureWasm()

    const salt = b64ToBytes(backup.backupSalt)
    const iv = b64ToBytes(backup.backupIv)
    const ciphertext = b64ToBytes(backup.encryptedBackup)
    const aesKey = await deriveBackupKey(password, salt, 'decrypt')
    const plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource,
    )
    const plaintext = JSON.parse(new TextDecoder().decode(plaintextBuf)) as BackupPlaintext

    const identityPublicKey = b64ToBytes(plaintext.identityPublicKey)
    const identityPrivateKey = b64ToBytes(plaintext.identityPrivateKey)

    const inner = WasmSignalClient.restore(
      identityPublicKey,
      identityPrivateKey,
      plaintext.registrationId,
      userId,
      plaintext.deviceId,
      0,
      0,
      0,
    )

    // Wipe any prior local state for this user before persisting the restored identity.
    await Promise.all([
      txDeleteByUserId(STORE_PREKEYS, userId),
      txDeleteByUserId(STORE_SIGNED_PREKEYS, userId),
      txDeleteByUserId(STORE_KYBER_PREKEYS, userId),
      txDeleteByUserId(STORE_SESSIONS, userId),
      txDeleteByUserId(STORE_SENDER_KEYS, userId),
    ])
    await txPut(STORE_META, {
      userId,
      identityPublicKey,
      identityPrivateKey,
      registrationId: plaintext.registrationId,
      deviceId: plaintext.deviceId,
      nextPrekeyId: 0,
      nextSignedPrekeyId: 0,
      nextKyberPrekeyId: 0,
      bootstrappedAt: Date.now(),
    } satisfies MetaRecord)

    return new SignalSession(userId, inner)
  }

  /**
   * Generate and publish identity + signed prekey + kyber prekey + 100 OTPs to the server.
   * Throws on any network error so callers can surface failures to the user.
   */
  async publishKeys(): Promise<void> {
    await api.put('/crypto/identity', {
      identityKey: bytesToB64(this.inner.get_identity_public_key()),
      registrationId: this.inner.get_registration_id(),
    })

    const spk = this.inner.generate_signed_pre_key()
    await txPut(STORE_SIGNED_PREKEYS, {
      key: `${this.userId}:${spk.id}`,
      userId: this.userId,
      id: spk.id,
      record: spk.record,
    } satisfies PrekeyRow)
    await api.put('/crypto/signed-prekey', {
      prekeyId: spk.id,
      publicKey: bytesToB64(spk.public_key),
      signature: bytesToB64(spk.signature),
    })

    const kpk = this.inner.generate_kyber_pre_key()
    await txPut(STORE_KYBER_PREKEYS, {
      key: `${this.userId}:${kpk.id}`,
      userId: this.userId,
      id: kpk.id,
      record: kpk.record,
    } satisfies PrekeyRow)
    await api.put('/crypto/kyber-prekey', {
      prekeyId: kpk.id,
      publicKey: bytesToB64(kpk.public_key),
      signature: bytesToB64(kpk.signature),
    })

    const otps = this.inner.generate_pre_keys(PREKEY_BATCH) as WasmPreKey[]
    const otpPayload: Array<{ prekeyId: number; publicKey: string }> = []
    for (const otp of otps) {
      await txPut(STORE_PREKEYS, {
        key: `${this.userId}:${otp.id}`,
        userId: this.userId,
        id: otp.id,
        record: otp.record,
      } satisfies PrekeyRow)
      otpPayload.push({ prekeyId: otp.id, publicKey: bytesToB64(otp.public_key) })
    }
    await api.post('/crypto/one-time-prekeys', { prekeys: otpPayload })

    const now = Date.now()
    await this.persistMeta({
      nextPrekeyId: this.inner.get_next_pre_key_id(),
      nextSignedPrekeyId: this.inner.get_next_signed_pre_key_id(),
      nextKyberPrekeyId: this.inner.get_next_kyber_pre_key_id(),
      lastSpkRotation: now,
      lastKyberRotation: now,
    })
  }

  /**
   * Generate a fresh signed prekey, persist it locally, publish to the server,
   * and stamp `lastSpkRotation`. Idempotent — call as often as you want.
   */
  async rotateSignedPrekey(): Promise<void> {
    const spk = this.inner.generate_signed_pre_key()
    await txPut(STORE_SIGNED_PREKEYS, {
      key: `${this.userId}:${spk.id}`,
      userId: this.userId,
      id: spk.id,
      record: spk.record,
    } satisfies PrekeyRow)
    await api.put('/crypto/signed-prekey', {
      prekeyId: spk.id,
      publicKey: bytesToB64(spk.public_key),
      signature: bytesToB64(spk.signature),
    })
    await this.persistMeta({
      nextSignedPrekeyId: this.inner.get_next_signed_pre_key_id(),
      lastSpkRotation: Date.now(),
    })
  }

  /**
   * Generate a fresh Kyber prekey, persist locally, publish to the server, and
   * stamp `lastKyberRotation`.
   */
  async rotateKyberPrekey(): Promise<void> {
    const kpk = this.inner.generate_kyber_pre_key()
    await txPut(STORE_KYBER_PREKEYS, {
      key: `${this.userId}:${kpk.id}`,
      userId: this.userId,
      id: kpk.id,
      record: kpk.record,
    } satisfies PrekeyRow)
    await api.put('/crypto/kyber-prekey', {
      prekeyId: kpk.id,
      publicKey: bytesToB64(kpk.public_key),
      signature: bytesToB64(kpk.signature),
    })
    await this.persistMeta({
      nextKyberPrekeyId: this.inner.get_next_kyber_pre_key_id(),
      lastKyberRotation: Date.now(),
    })
  }

  /**
   * If the server is below `threshold` unused one-time prekeys, generate and
   * upload a fresh batch. No-op when the supply is healthy.
   */
  async refillOneTimePrekeys(
    threshold = OTP_REFILL_THRESHOLD,
    batch = PREKEY_BATCH,
  ): Promise<void> {
    const { data } = await api.get<{ count: number }>('/crypto/one-time-prekeys/count')
    if (data.count >= threshold) return

    const otps = this.inner.generate_pre_keys(batch) as WasmPreKey[]
    const otpPayload: Array<{ prekeyId: number; publicKey: string }> = []
    for (const otp of otps) {
      await txPut(STORE_PREKEYS, {
        key: `${this.userId}:${otp.id}`,
        userId: this.userId,
        id: otp.id,
        record: otp.record,
      } satisfies PrekeyRow)
      otpPayload.push({ prekeyId: otp.id, publicKey: bytesToB64(otp.public_key) })
    }
    await api.post('/crypto/one-time-prekeys', { prekeys: otpPayload })
    await this.persistMeta({ nextPrekeyId: this.inner.get_next_pre_key_id() })
  }

  /**
   * Best-effort prekey maintenance: rotate SPK + Kyber if older than 7 days,
   * refill OTPs if the server pool is low. Each step is independent — a failure
   * in one does not abort the others, and exceptions are swallowed (with a
   * console warning) so this can be called in fire-and-forget fashion from the
   * login path.
   */
  async runKeyMaintenance(): Promise<void> {
    const meta = await txGet<MetaRecord>(STORE_META, this.userId)
    if (!meta) return
    const now = Date.now()

    const spkStale = !meta.lastSpkRotation || now - meta.lastSpkRotation >= ROTATION_INTERVAL_MS
    if (spkStale) {
      try {
        await this.rotateSignedPrekey()
      } catch (err) {
        console.warn('[crypto] SPK rotation failed', err)
      }
    }

    const kyberStale = !meta.lastKyberRotation || now - meta.lastKyberRotation >= ROTATION_INTERVAL_MS
    if (kyberStale) {
      try {
        await this.rotateKyberPrekey()
      } catch (err) {
        console.warn('[crypto] Kyber rotation failed', err)
      }
    }

    try {
      await this.refillOneTimePrekeys()
    } catch (err) {
      console.warn('[crypto] OTP refill failed', err)
    }
  }

  private async persistMeta(updates: Partial<MetaRecord>): Promise<void> {
    const meta = await txGet<MetaRecord>(STORE_META, this.userId)
    if (!meta) return
    await txPut(STORE_META, { ...meta, ...updates })
  }

  private async persistCounters(): Promise<void> {
    await this.persistMeta({
      nextPrekeyId: this.inner.get_next_pre_key_id(),
      nextSignedPrekeyId: this.inner.get_next_signed_pre_key_id(),
      nextKyberPrekeyId: this.inner.get_next_kyber_pre_key_id(),
    })
  }

  async exportEncryptedBackup(password: string): Promise<EncryptedSignalBackup> {
    const idKp = this.inner.get_identity_key_pair()
    const plaintext: BackupPlaintext = {
      identityPublicKey: bytesToB64(idKp.public_key),
      identityPrivateKey: bytesToB64(idKp.private_key),
      registrationId: this.inner.get_registration_id(),
      deviceId: this.inner.get_local_device_id(),
    }

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const aesKey = await deriveBackupKey(password, salt, 'encrypt')
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aesKey,
      new TextEncoder().encode(JSON.stringify(plaintext)) as BufferSource,
    )

    return {
      encryptedBackup: bytesToB64(new Uint8Array(ciphertext)),
      backupSalt: bytesToB64(salt),
      backupIv: bytesToB64(iv),
    }
  }

  // ── Message ops (used by T4+ chat layer) ────────────────────────────────

  async hasSession(contactUuid: string, deviceId = DEVICE_ID): Promise<boolean> {
    return this.inner.has_session(contactUuid, deviceId)
  }

  async processPrekeyBundleForRecipient(recipientUuid: string): Promise<void> {
    const { data } = await api.get<{
      userId: string
      registrationId: number
      identityKey: string
      signedPrekey: { prekeyId: number; publicKey: string; signature: string }
      kyberPrekey: { prekeyId: number; publicKey: string; signature: string }
      oneTimePrekey: { prekeyId: number; publicKey: string } | null
    }>(`/crypto/prekey-bundle/${recipientUuid}`)

    const newIdentityKey = b64ToBytes(data.identityKey)
    const idKey = `${this.userId}:${recipientUuid}`
    const known = await txGet<IdentityRow>(STORE_IDENTITIES, idKey)

    if (known) {
      // Pending acknowledgement — refuse session establishment until user accepts.
      if (known.status === 'pending') {
        const pendingKey = known.pendingNewKey ?? newIdentityKey
        throw new IdentityChangedError(recipientUuid, known.identityKey, pendingKey)
      }
      // Trusted but the bundle now reports a different identity → mark pending and abort.
      if (!bytesEqual(known.identityKey, newIdentityKey)) {
        const detectedAt = Date.now()
        await txPut(STORE_IDENTITIES, {
          key: idKey,
          userId: this.userId,
          contactUuid: recipientUuid,
          identityKey: known.identityKey,
          firstSeenAt: known.firstSeenAt,
          status: 'pending',
          pendingNewKey: newIdentityKey,
          pendingDetectedAt: detectedAt,
        } satisfies IdentityRow)
        emitIdentityChange({
          contactUuid: recipientUuid,
          oldKey: known.identityKey,
          newKey: newIdentityKey,
          detectedAt,
        })
        throw new IdentityChangedError(recipientUuid, known.identityKey, newIdentityKey)
      }
    } else {
      // First contact — TOFU: trust on first use.
      await txPut(STORE_IDENTITIES, {
        key: idKey,
        userId: this.userId,
        contactUuid: recipientUuid,
        identityKey: newIdentityKey,
        firstSeenAt: Date.now(),
        status: 'trusted',
      } satisfies IdentityRow)
    }

    await this.inner.process_pre_key_bundle(
      recipientUuid,
      DEVICE_ID,
      data.registrationId,
      newIdentityKey,
      data.signedPrekey.prekeyId,
      b64ToBytes(data.signedPrekey.publicKey),
      b64ToBytes(data.signedPrekey.signature),
      data.oneTimePrekey?.prekeyId ?? null,
      data.oneTimePrekey ? b64ToBytes(data.oneTimePrekey.publicKey) : null,
      data.kyberPrekey.prekeyId,
      b64ToBytes(data.kyberPrekey.publicKey),
      b64ToBytes(data.kyberPrekey.signature),
    )
    await this.persistSession(recipientUuid, DEVICE_ID)
  }

  // ── Identity (TOFU) management ──────────────────────────────────────────

  async getKnownIdentity(contactUuid: string): Promise<IdentityRow | null> {
    return txGet<IdentityRow>(STORE_IDENTITIES, `${this.userId}:${contactUuid}`)
  }

  async listPendingIdentityChanges(): Promise<PendingIdentityChange[]> {
    const all = await txListByUserId<IdentityRow>(STORE_IDENTITIES, this.userId)
    return all
      .filter((row): row is IdentityRow & { pendingNewKey: Uint8Array; pendingDetectedAt: number } =>
        row.status === 'pending' && !!row.pendingNewKey && !!row.pendingDetectedAt,
      )
      .map((row) => ({
        contactUuid: row.contactUuid,
        oldKey: row.identityKey,
        newKey: row.pendingNewKey,
        detectedAt: row.pendingDetectedAt,
      }))
  }

  /**
   * Accept a peer's new identity key. Promotes pendingNewKey → trusted identityKey,
   * clears the stale local session row, and re-bootstraps the Signal session via
   * processPrekeyBundleForRecipient so future encrypts use the new identity.
   */
  async acknowledgeIdentityChange(contactUuid: string): Promise<void> {
    const idKey = `${this.userId}:${contactUuid}`
    const known = await txGet<IdentityRow>(STORE_IDENTITIES, idKey)
    if (!known || known.status !== 'pending' || !known.pendingNewKey) return

    await txPut(STORE_IDENTITIES, {
      key: idKey,
      userId: this.userId,
      contactUuid,
      identityKey: known.pendingNewKey,
      firstSeenAt: known.firstSeenAt,
      status: 'trusted',
    } satisfies IdentityRow)

    // Drop the stale persisted session so the next operation re-bootstraps.
    await txDelete(STORE_SESSIONS, `${this.userId}:${contactUuid}:${DEVICE_ID}`)

    // Re-bootstrap immediately — overwrites the in-memory wasm session with the new identity.
    await this.processPrekeyBundleForRecipient(contactUuid)
  }

  async encryptMessage(recipientUuid: string, plaintext: Uint8Array): Promise<{ messageType: number; body: Uint8Array }> {
    const ct: WasmCiphertext = await this.inner.encrypt_message(recipientUuid, DEVICE_ID, plaintext)
    await this.persistSession(recipientUuid, DEVICE_ID)
    return { messageType: ct.message_type, body: ct.body }
  }

  async decryptMessage(senderUuid: string, ciphertext: Uint8Array, messageType: number): Promise<Uint8Array> {
    const plaintext = await this.inner.decrypt_message(senderUuid, DEVICE_ID, ciphertext, messageType)
    await this.persistSession(senderUuid, DEVICE_ID)
    await this.persistCounters()
    return plaintext
  }

  private async persistSession(contactUuid: string, deviceId: number): Promise<void> {
    const record = await this.inner.export_session(contactUuid, deviceId)
    if (!record) return
    await txPut(STORE_SESSIONS, {
      key: `${this.userId}:${contactUuid}:${deviceId}`,
      userId: this.userId,
      contactUuid,
      deviceId,
      record,
    } satisfies SessionRow)
  }

  // ── Group ops ───────────────────────────────────────────────────────────

  async createSenderKeyDistribution(distributionId: string): Promise<Uint8Array> {
    const skdm = await this.inner.create_sender_key_distribution(distributionId)
    await this.persistSenderKey(this.userId, DEVICE_ID, distributionId)
    return skdm
  }

  async processSenderKeyDistribution(senderUuid: string, distMessage: Uint8Array, distributionId: string, deviceId = DEVICE_ID): Promise<void> {
    await this.inner.process_sender_key_distribution(senderUuid, deviceId, distMessage)
    await this.persistSenderKey(senderUuid, deviceId, distributionId)
  }

  async encryptGroupMessage(distributionId: string, plaintext: Uint8Array): Promise<Uint8Array> {
    const ct = await this.inner.encrypt_group_message(distributionId, plaintext)
    await this.persistSenderKey(this.userId, DEVICE_ID, distributionId)
    return ct
  }

  async decryptGroupMessage(senderUuid: string, ciphertext: Uint8Array, deviceId = DEVICE_ID): Promise<Uint8Array> {
    return this.inner.decrypt_group_message(senderUuid, deviceId, ciphertext)
  }

  private async persistSenderKey(memberUuid: string, deviceId: number, distributionId: string): Promise<void> {
    const record = await this.inner.export_sender_key(memberUuid, deviceId, distributionId)
    if (!record) return
    await txPut(STORE_SENDER_KEYS, {
      key: `${this.userId}:${memberUuid}:${deviceId}:${distributionId}`,
      userId: this.userId,
      memberUuid,
      deviceId,
      distributionId,
      record,
    } satisfies SenderKeyRow)
  }

  // ── Safety numbers ──────────────────────────────────────────────────────

  generateSafetyNumber(contactUuid: string, contactIdentityKey: Uint8Array): WasmSafetyNumber {
    return this.inner.generate_safety_number(contactUuid, contactIdentityKey)
  }

  verifySafetyNumber(scanned: Uint8Array, contactUuid: string, contactIdentityKey: Uint8Array): boolean {
    return this.inner.verify_safety_number(scanned, contactUuid, contactIdentityKey)
  }

  // ── Identity exposure (for safety numbers / debugging) ──────────────────

  getIdentityPublicKey(): Uint8Array {
    return this.inner.get_identity_public_key()
  }

  getRegistrationId(): number {
    return this.inner.get_registration_id()
  }
}

// ── Module-level singleton ────────────────────────────────────────────────

let _activeSession: SignalSession | null = null

export async function peekLocalSignalMeta(userId: string): Promise<MetaRecord | null> {
  return txGet<MetaRecord>(STORE_META, userId)
}

export async function initSignalClient(userId: string): Promise<SignalSession> {
  if (_activeSession?.userId === userId) return _activeSession
  _activeSession = await SignalSession.load(userId)
  return _activeSession
}

export function getActiveSignalSession(): SignalSession | null {
  return _activeSession
}

export function resetSignalSession(): void {
  _activeSession = null
}

export async function clearSignalLocalKeys(userId: string): Promise<void> {
  await Promise.all(ALL_STORES.map(s => txDeleteByUserId(s, userId)))
  if (_activeSession?.userId === userId) _activeSession = null
}

export async function adoptRestoredSession(session: SignalSession): Promise<void> {
  _activeSession = session
}
