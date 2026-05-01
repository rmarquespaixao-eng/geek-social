import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CryptoService } from './crypto.service.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

type CryptoRoutesOptions = { cryptoService: CryptoService }

const fromB64 = (s: string): Uint8Array => Buffer.from(s, 'base64')
const toB64 = (b: Uint8Array): string => Buffer.from(b).toString('base64')

const userIdParam = z.object({ userId: z.string().uuid() })
const conversationIdParam = z.object({ conversationId: z.string().uuid() })
const skdmParams = z.object({
  conversationId: z.string().uuid(),
  senderUserId: z.string().uuid(),
})

const b64 = z.string().min(1).max(8192).regex(/^[A-Za-z0-9+/=]+$/, 'invalid base64')

const putIdentityBody = z.object({
  identityKey: b64,
  registrationId: z.number().int().min(0).max(0x3fff),
})

const putSignedPrekeyBody = z.object({
  prekeyId: z.number().int().min(0).max(0xffffff),
  publicKey: b64,
  signature: b64,
})

const putKyberPrekeyBody = z.object({
  prekeyId: z.number().int().min(0).max(0xffffff),
  publicKey: b64,
  signature: b64,
})

const putOneTimePrekeysBody = z.object({
  prekeys: z.array(z.object({
    prekeyId: z.number().int().min(0).max(0xffffff),
    publicKey: b64,
  })).min(1).max(200),
})

const putBackupBody = z.object({
  encryptedBackup: b64,
  backupSalt: b64,
  backupIv: b64,
})

const putSenderKeyDistributionsBody = z.object({
  distributions: z.array(z.object({
    recipientUserId: z.string().uuid(),
    ciphertext: b64,
  })).min(1).max(500),
})

export const cryptoRoutes: FastifyPluginAsyncZod<CryptoRoutesOptions> = async (app, opts) => {
  const svc = opts.cryptoService

  app.put('/identity', {
    schema: {
      operationId: 'crypto_put_identity',
      tags: ['Crypto'],
      body: putIdentityBody,
      response: { 204: z.void() },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    await svc.putIdentity(userId, {
      identityKey: fromB64(req.body.identityKey),
      registrationId: req.body.registrationId,
    })
    return reply.status(204).send()
  })

  app.get('/identity/:userId', {
    schema: {
      operationId: 'crypto_get_identity',
      tags: ['Crypto'],
      params: userIdParam,
      response: {
        200: z.object({
          userId: z.string(),
          identityKey: z.string(),
          registrationId: z.number(),
        }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const row = await svc.getIdentity(req.params.userId)
    if (!row) return reply.status(404).send({ error: 'IDENTITY_NOT_FOUND' })
    return reply.send({
      userId: row.userId,
      identityKey: toB64(row.identityKey),
      registrationId: row.registrationId,
    })
  })

  app.put('/signed-prekey', {
    schema: {
      operationId: 'crypto_put_signed_prekey',
      tags: ['Crypto'],
      body: putSignedPrekeyBody,
      response: { 204: z.void() },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    await svc.putSignedPrekey(userId, {
      prekeyId: req.body.prekeyId,
      publicKey: fromB64(req.body.publicKey),
      signature: fromB64(req.body.signature),
    })
    return reply.status(204).send()
  })

  app.put('/kyber-prekey', {
    schema: {
      operationId: 'crypto_put_kyber_prekey',
      tags: ['Crypto'],
      body: putKyberPrekeyBody,
      response: { 204: z.void() },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    await svc.putKyberPrekey(userId, {
      prekeyId: req.body.prekeyId,
      publicKey: fromB64(req.body.publicKey),
      signature: fromB64(req.body.signature),
    })
    return reply.status(204).send()
  })

  app.post('/one-time-prekeys', {
    schema: {
      operationId: 'crypto_put_one_time_prekeys',
      tags: ['Crypto'],
      body: putOneTimePrekeysBody,
      response: { 204: z.void() },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    await svc.putOneTimePrekeys(userId, req.body.prekeys.map(p => ({
      prekeyId: p.prekeyId,
      publicKey: fromB64(p.publicKey),
    })))
    return reply.status(204).send()
  })

  app.get('/one-time-prekeys/count', {
    schema: {
      operationId: 'crypto_count_one_time_prekeys',
      tags: ['Crypto'],
      response: { 200: z.object({ count: z.number().int() }) },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    const count = await svc.countOneTimePrekeys(userId)
    return reply.send({ count })
  })

  app.get('/prekey-bundle/:userId', {
    schema: {
      operationId: 'crypto_fetch_prekey_bundle',
      tags: ['Crypto'],
      params: userIdParam,
      response: {
        200: z.object({
          userId: z.string(),
          registrationId: z.number(),
          identityKey: z.string(),
          signedPrekey: z.object({
            prekeyId: z.number(),
            publicKey: z.string(),
            signature: z.string(),
          }),
          kyberPrekey: z.object({
            prekeyId: z.number(),
            publicKey: z.string(),
            signature: z.string(),
          }),
          oneTimePrekey: z.object({
            prekeyId: z.number(),
            publicKey: z.string(),
          }).nullable(),
        }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const bundle = await svc.fetchPrekeyBundle(req.params.userId)
    if (!bundle) return reply.status(404).send({ error: 'BUNDLE_NOT_FOUND' })
    return reply.send({
      userId: bundle.userId,
      registrationId: bundle.registrationId,
      identityKey: toB64(bundle.identityKey),
      signedPrekey: {
        prekeyId: bundle.signedPrekey.prekeyId,
        publicKey: toB64(bundle.signedPrekey.publicKey),
        signature: toB64(bundle.signedPrekey.signature),
      },
      kyberPrekey: {
        prekeyId: bundle.kyberPrekey.prekeyId,
        publicKey: toB64(bundle.kyberPrekey.publicKey),
        signature: toB64(bundle.kyberPrekey.signature),
      },
      oneTimePrekey: bundle.oneTimePrekey
        ? { prekeyId: bundle.oneTimePrekey.prekeyId, publicKey: toB64(bundle.oneTimePrekey.publicKey) }
        : null,
    })
  })

  app.put('/backup', {
    schema: {
      operationId: 'crypto_upsert_backup',
      tags: ['Crypto'],
      body: putBackupBody,
      response: { 204: z.void() },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    await svc.upsertBackup(userId, {
      encryptedBackup: fromB64(req.body.encryptedBackup),
      backupSalt: fromB64(req.body.backupSalt),
      backupIv: fromB64(req.body.backupIv),
    })
    return reply.status(204).send()
  })

  app.get('/backup', {
    schema: {
      operationId: 'crypto_get_backup',
      tags: ['Crypto'],
      response: {
        200: z.object({
          encryptedBackup: z.string(),
          backupSalt: z.string(),
          backupIv: z.string(),
        }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    const backup = await svc.getBackup(userId)
    if (!backup) return reply.status(404).send({ error: 'NO_BACKUP' })
    return reply.send({
      encryptedBackup: toB64(backup.encryptedBackup),
      backupSalt: toB64(backup.backupSalt),
      backupIv: toB64(backup.backupIv),
    })
  })

  app.put('/sender-key-distribution/:conversationId', {
    schema: {
      operationId: 'crypto_put_sender_key_distributions',
      tags: ['Crypto'],
      params: conversationIdParam,
      body: putSenderKeyDistributionsBody,
      response: {
        204: z.void(),
        403: z.object({ error: z.string() }),
        422: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    try {
      await svc.putSenderKeyDistributions(
        userId,
        req.params.conversationId,
        req.body.distributions.map(d => ({
          recipientUserId: d.recipientUserId,
          ciphertext: fromB64(d.ciphertext),
        })),
      )
      return reply.status(204).send()
    } catch (err) {
      const e = err as Error
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' })
      if (e.message === 'MEMBER_NOT_FOUND') return reply.status(422).send({ error: 'MEMBER_NOT_FOUND' })
      throw err
    }
  })

  app.get('/sender-key-distribution/:conversationId/:senderUserId', {
    schema: {
      operationId: 'crypto_get_sender_key_distribution',
      tags: ['Crypto'],
      params: skdmParams,
      response: {
        200: z.object({ ciphertext: z.string() }),
        403: z.object({ error: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    try {
      const skdm = await svc.getSenderKeyDistribution(userId, req.params.conversationId, req.params.senderUserId)
      if (!skdm) return reply.status(404).send({ error: 'SKDM_NOT_FOUND' })
      return reply.send({ ciphertext: toB64(skdm.ciphertext) })
    } catch (err) {
      const e = err as Error
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' })
      throw err
    }
  })
}
