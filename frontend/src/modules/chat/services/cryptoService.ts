import { api } from '@/shared/http/api'

// ── Types ──────────────────────────────────────────────────────────────────

export interface EncryptedBackup {
  encryptedBackup: string
  backupSalt: string
  backupIv: string
}

// ── IndexedDB wrapper ──────────────────────────────────────────────────────

const DB_NAME = 'geek-crypto-v1'
const STORE_NAME = 'keys'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(id: string, key: CryptoKey): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ id, key })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(id: string): Promise<CryptoKey | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result ? (req.result as { key: CryptoKey }).key : null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function bytesToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── In-memory caches ───────────────────────────────────────────────────────

const dmKeyCache = new Map<string, CryptoKey>()
const groupKeyCache = new Map<string, CryptoKey>()
const groupKeyVersionCache = new Map<string, number>()
const pubKeyCache = new Map<string, string>()

// ── Key pair management ────────────────────────────────────────────────────

export async function loadPrivateKey(userId: string): Promise<CryptoKey | null> {
  return idbGet(`privkey:${userId}`)
}

export function isReady(userId: string): boolean {
  // Synchronous check — requires initKeyPair to have been called first.
  // We track readiness via a module-level Set to avoid async checks on hot path.
  return _readyUsers.has(userId)
}

const _readyUsers = new Set<string>()

export async function initKeyPair(userId: string): Promise<string> {
  const existing = await loadPrivateKey(userId)
  if (existing) {
    _readyUsers.add(userId)
    const pubKey = await idbGet(`pubkey:${userId}`)
    if (pubKey) return exportPublicKey(pubKey)
    // Recover: re-derive public from private (not directly possible with non-extractable keys)
    // Fall through to regenerate
  }
  return _generateAndStore(userId)
}

async function _generateAndStore(userId: string): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )
  await idbPut(`privkey:${userId}`, keyPair.privateKey)
  await idbPut(`pubkey:${userId}`, keyPair.publicKey)
  _readyUsers.add(userId)
  return exportPublicKey(keyPair.publicKey)
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key)
  return bytesToB64(spki)
}

export async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64ToBytes(spkiB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
}

// ── Backup (WhatsApp style) ────────────────────────────────────────────────

export async function exportEncryptedBackup(userId: string, password: string): Promise<EncryptedBackup> {
  const privKey = await loadPrivateKey(userId)
  if (!privKey) throw new Error('No private key found for backup')

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privKey)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, pkcs8)

  return {
    encryptedBackup: bytesToB64(ciphertext),
    backupSalt: bytesToHex(salt),
    backupIv: bytesToB64(iv),
  }
}

export async function importFromBackup(userId: string, backup: EncryptedBackup, password: string): Promise<string> {
  const salt = hexToBytes(backup.backupSalt)
  const iv = b64ToBytes(backup.backupIv)
  const ciphertext = b64ToBytes(backup.encryptedBackup)

  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)

  const privKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )

  // Derive public key from private (re-generate keypair via export + re-import)
  // Web Crypto doesn't expose public from private directly; we re-derive by importing as extractable
  // and re-exporting. Since we store the public key separately, attempt to reconstruct it.
  await idbPut(`privkey:${userId}`, privKey)

  // Re-derive public key: generate a fresh pair and replace with the imported private
  // Actually Web Crypto has no "publicFromPrivate" — we must have stored it or fetch from server.
  // Fetch the public key from the server (it's public knowledge) and store it.
  const serverKey = await _fetchAndCachePublicKey(userId)
  if (serverKey) {
    const pubCryptoKey = await importPublicKey(serverKey)
    await idbPut(`pubkey:${userId}`, pubCryptoKey)
  }

  _readyUsers.add(userId)
  return serverKey ?? ''
}

// ── Public key cache + fetch ───────────────────────────────────────────────

async function _fetchAndCachePublicKey(userId: string): Promise<string | null> {
  try {
    const { data } = await api.get<{ userId: string; publicKey: string }>(`/crypto/public-key/${userId}`)
    pubKeyCache.set(userId, data.publicKey)
    return data.publicKey
  } catch {
    return null
  }
}

export async function getOrFetchPublicKey(userId: string): Promise<string | null> {
  const cached = pubKeyCache.get(userId)
  if (cached) return cached
  return _fetchAndCachePublicKey(userId)
}

export async function prefetchPublicKeys(userIds: string[]): Promise<void> {
  const missing = userIds.filter(id => !pubKeyCache.has(id))
  if (missing.length === 0) return
  try {
    const { data } = await api.get<{ keys: { userId: string; publicKey: string }[] }>(
      `/crypto/public-keys?userIds=${missing.join(',')}`,
    )
    for (const { userId, publicKey } of data.keys) {
      pubKeyCache.set(userId, publicKey)
    }
  } catch {
    // non-fatal: keys will be fetched individually on demand
  }
}

// ── DM encryption ──────────────────────────────────────────────────────────

async function _getDmKey(myUserId: string, theirPublicKeyB64: string): Promise<CryptoKey> {
  const cacheKey = `${myUserId}:${theirPublicKeyB64}`
  const cached = dmKeyCache.get(cacheKey)
  if (cached) return cached

  const myPrivKey = await loadPrivateKey(myUserId)
  if (!myPrivKey) throw new Error('No private key available')

  const theirPubKey = await importPublicKey(theirPublicKeyB64)

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPubKey },
    myPrivKey,
    256,
  )

  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('geek-social-dm-v1'),
      info: new Uint8Array(0),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  dmKeyCache.set(cacheKey, aesKey)
  return aesKey
}

export async function encryptDm(myUserId: string, theirPublicKeyB64: string, plaintext: string): Promise<string> {
  const key = await _getDmKey(myUserId, theirPublicKeyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${bytesToB64(iv)}.${bytesToB64(ciphertext)}`
}

export async function decryptDm(myUserId: string, theirPublicKeyB64: string, ciphertext: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = ciphertext.split('.')
    if (!ivB64 || !ctB64) return null
    const key = await _getDmKey(myUserId, theirPublicKeyB64)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
      key,
      b64ToBytes(ctB64),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

// ── Group encryption ───────────────────────────────────────────────────────

export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function encryptGroupKeyForMember(groupKey: CryptoKey, memberPublicKeyB64: string): Promise<string> {
  // Generate ephemeral ECDH keypair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )

  const memberPubKey = await importPublicKey(memberPublicKeyB64)

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: memberPubKey },
    ephemeral.privateKey,
    256,
  )

  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const wrapKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('geek-social-group-v1'),
      info: new Uint8Array(0),
    },
    hkdfKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey'],
  )

  const wrapped = await crypto.subtle.wrapKey('raw', groupKey, wrapKey, 'AES-KW')
  const ephemeralPubB64 = await exportPublicKey(ephemeral.publicKey)

  return `${ephemeralPubB64}.${bytesToB64(wrapped)}`
}

export async function decryptGroupKey(myUserId: string, encryptedKeyBlob: string): Promise<CryptoKey | null> {
  try {
    const dotIdx = encryptedKeyBlob.indexOf('.')
    if (dotIdx === -1) return null
    const ephemeralPubB64 = encryptedKeyBlob.slice(0, dotIdx)
    const wrappedB64 = encryptedKeyBlob.slice(dotIdx + 1)

    const myPrivKey = await loadPrivateKey(myUserId)
    if (!myPrivKey) return null

    const ephemeralPubKey = await importPublicKey(ephemeralPubB64)

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: ephemeralPubKey },
      myPrivKey,
      256,
    )

    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
    const unwrapKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('geek-social-group-v1'),
        info: new Uint8Array(0),
      },
      hkdfKey,
      { name: 'AES-KW', length: 256 },
      false,
      ['unwrapKey'],
    )

    const groupKey = await crypto.subtle.unwrapKey(
      'raw',
      b64ToBytes(wrappedB64),
      unwrapKey,
      'AES-KW',
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )

    return groupKey
  } catch {
    return null
  }
}

export async function encryptGroup(groupKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    groupKey,
    new TextEncoder().encode(plaintext),
  )
  return `${bytesToB64(iv)}.${bytesToB64(ciphertext)}`
}

export async function decryptGroup(groupKey: CryptoKey, ciphertext: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = ciphertext.split('.')
    if (!ivB64 || !ctB64) return null
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
      groupKey,
      b64ToBytes(ctB64),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

// ── Group key cache (per conversationId + keyVersion) ─────────────────────

export async function getOrLoadGroupKey(
  myUserId: string,
  conversationId: string,
): Promise<CryptoKey | null> {
  const cached = groupKeyCache.get(conversationId)
  if (cached) return cached

  try {
    const { data } = await api.get<{ encryptedKey: string; keyVersion: number }>(
      `/crypto/group-key/${conversationId}`,
    )
    const key = await decryptGroupKey(myUserId, data.encryptedKey)
    if (key) {
      groupKeyCache.set(conversationId, key)
      groupKeyVersionCache.set(conversationId, data.keyVersion)
    }
    return key
  } catch {
    return null
  }
}

export function setCachedGroupKey(conversationId: string, key: CryptoKey, keyVersion = 1): void {
  groupKeyCache.set(conversationId, key)
  groupKeyVersionCache.set(conversationId, keyVersion)
}

/** Generate a new group key and distribute it to all members (called at group creation). */
export async function distributeGroupKeys(
  conversationId: string,
  memberIds: string[],
): Promise<void> {
  const groupKey = await generateGroupKey()
  const keyVersion = 1

  await prefetchPublicKeys(memberIds)

  const keys: Array<{ userId: string; encryptedKey: string; keyVersion: number }> = []
  await Promise.allSettled(
    memberIds.map(async (userId) => {
      const pubKey = await getOrFetchPublicKey(userId)
      if (!pubKey) return
      const encryptedKey = await encryptGroupKeyForMember(groupKey, pubKey)
      keys.push({ userId, encryptedKey, keyVersion })
    }),
  )

  if (keys.length === 0) return

  await api.put(`/crypto/group-key/${conversationId}`, { keys })
  groupKeyCache.set(conversationId, groupKey)
  groupKeyVersionCache.set(conversationId, keyVersion)
}

/** Encrypt the current group key for a newly added member. */
export async function distributeGroupKeyToMember(
  myUserId: string,
  conversationId: string,
  memberId: string,
): Promise<void> {
  const groupKey = await getOrLoadGroupKey(myUserId, conversationId)
  if (!groupKey) return

  const pubKey = await getOrFetchPublicKey(memberId)
  if (!pubKey) return

  const keyVersion = groupKeyVersionCache.get(conversationId) ?? 1
  const encryptedKey = await encryptGroupKeyForMember(groupKey, pubKey)
  await api.put(`/crypto/group-key/${conversationId}`, {
    keys: [{ userId: memberId, encryptedKey, keyVersion }],
  })
}

// ── Cleanup ────────────────────────────────────────────────────────────────

export function clearKeyCache(): void {
  dmKeyCache.clear()
  groupKeyCache.clear()
  groupKeyVersionCache.clear()
  pubKeyCache.clear()
}

export async function clearLocalKeys(userId: string): Promise<void> {
  await idbDelete(`privkey:${userId}`)
  await idbDelete(`pubkey:${userId}`)
  _readyUsers.delete(userId)
  clearKeyCache()
}
