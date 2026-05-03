import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UserAccessLogRepository } from '../admin/logs/user-access-log.repository.js'

const noContent = z.void()

const bodySchema = z.object({
  path: z.string().max(500),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const activityRoutes: FastifyPluginAsyncZod<{ repo: UserAccessLogRepository }> = async (app, opts) => {
  app.post<{ Body: z.infer<typeof bodySchema> }>('/page-view', {
    schema: {
      operationId: 'activity_page_view',
      tags: ['Activity'],
      body: bodySchema,
      response: { 204: noContent },
    },
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof bodySchema> }>,
      reply: FastifyReply,
    ) => {
      const userId = (request.user as { userId?: string } | undefined)?.userId ?? null
      const ip = request.ip ?? (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      const userAgent = request.headers['user-agent'] as string | undefined
      const { path, metadata } = request.body

      await opts.repo.insert({
        userId,
        action: 'page_view',
        path,
        ip,
        userAgent,
        metadata: metadata ?? {},
      })

      return reply.status(204).send()
    },
  })
}
