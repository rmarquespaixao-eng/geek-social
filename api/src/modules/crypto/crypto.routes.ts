import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CryptoService } from './crypto.service.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

type CryptoRoutesOptions = { cryptoService: CryptoService }

const userIdParam = z.object({ userId: z.string().uuid() })
const conversationIdParam = z.object({ conversationId: z.string().uuid() })

const upsertPublicKeyBody = z.object({
  publicKey: z.string().min(1).max(2048),
})

const upsertBackupBody = z.object({
  encryptedBackup: z.string().min(1),
  backupSalt: z.string().min(1),
  backupIv: z.string().min(1),
})

const setGroupKeysBody = z.object({
  keys: z.array(z.object({
    userId: z.string().uuid(),
    encryptedKey: z.string().min(1),
    keyVersion: z.number().int().positive(),
  })).min(1).max(500),
})

const batchUserIdsQuery = z.object({
  userIds: z.string().min(1),
})

export const cryptoRoutes: FastifyPluginAsyncZod<CryptoRoutesOptions> = async (app, opts) => {
  const svc = opts.cryptoService

  app.put('/my-key', {
    schema: {
      operationId: 'crypto_upsert_public_key',
      tags: ['Crypto'],
      body: upsertPublicKeyBody,
      response: { 200: z.object({ publicKey: z.string(), updatedAt: z.string() }) },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    const result = await svc.upsertPublicKey(userId, req.body.publicKey)
    return reply.send({ publicKey: result.publicKey, updatedAt: result.updatedAt.toISOString() })
  })

  app.get('/public-key/:userId', {
    schema: {
      operationId: 'crypto_get_public_key',
      tags: ['Crypto'],
      params: userIdParam,
      response: {
        200: z.object({ userId: z.string(), publicKey: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const result = await svc.getPublicKey(req.params.userId)
    if (!result) return reply.status(404).send({ error: 'KEY_NOT_FOUND' })
    return reply.send(result)
  })

  app.get('/public-keys', {
    schema: {
      operationId: 'crypto_get_public_keys_batch',
      tags: ['Crypto'],
      querystring: batchUserIdsQuery,
      response: {
        200: z.object({ keys: z.array(z.object({ userId: z.string(), publicKey: z.string() })) }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const userIds = req.query.userIds.split(',').slice(0, 100).filter(id => id.length > 0)
    const keys = await svc.getPublicKeysBatch(userIds)
    return reply.send({ keys })
  })

  app.put('/backup', {
    schema: {
      operationId: 'crypto_upsert_backup',
      tags: ['Crypto'],
      body: upsertBackupBody,
      response: { 204: z.void() },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    await svc.upsertBackup(userId, req.body)
    return reply.status(204).send()
  })

  app.get('/backup', {
    schema: {
      operationId: 'crypto_get_backup',
      tags: ['Crypto'],
      response: {
        200: z.object({ encryptedBackup: z.string(), backupSalt: z.string(), backupIv: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    const backup = await svc.getBackup(userId)
    if (!backup) return reply.status(404).send({ error: 'NO_BACKUP' })
    return reply.send(backup)
  })

  app.put('/group-key/:conversationId', {
    schema: {
      operationId: 'crypto_set_group_keys',
      tags: ['Crypto'],
      params: conversationIdParam,
      body: setGroupKeysBody,
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
      await svc.setGroupKeys(userId, req.params.conversationId, req.body.keys)
      return reply.status(204).send()
    } catch (err) {
      const e = err as Error
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' })
      if (e.message === 'MEMBER_NOT_FOUND') return reply.status(422).send({ error: 'MEMBER_NOT_FOUND' })
      throw err
    }
  })

  app.get('/group-key/:conversationId', {
    schema: {
      operationId: 'crypto_get_group_key',
      tags: ['Crypto'],
      params: conversationIdParam,
      response: {
        200: z.object({ encryptedKey: z.string(), keyVersion: z.number() }),
        403: z.object({ error: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const { userId } = req.user as { userId: string }
    try {
      const key = await svc.getGroupKey(userId, req.params.conversationId)
      if (!key) return reply.status(404).send({ error: 'KEY_NOT_FOUND' })
      return reply.send({ encryptedKey: key.encryptedKey, keyVersion: key.keyVersion })
    } catch (err) {
      const e = err as Error
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' })
      throw err
    }
  })
}
