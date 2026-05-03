import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../../../config/env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

export type CiphertextBundle = {
  ciphertext: Buffer
  iv: Buffer
  tag: Buffer
}

function getMasterKey(): Buffer {
  return Buffer.from(env.ADMIN_SECRETS_ENC_KEY, 'hex')
}

export function encryptSecret(plaintext: string): CiphertextBundle {
  const key = getMasterKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: encrypted, iv, tag }
}

export function decryptSecret(bundle: CiphertextBundle): string {
  const key = getMasterKey()
  const decipher = createDecipheriv(ALGORITHM, key, bundle.iv)
  decipher.setAuthTag(bundle.tag)
  const decrypted = Buffer.concat([
    decipher.update(bundle.ciphertext),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
