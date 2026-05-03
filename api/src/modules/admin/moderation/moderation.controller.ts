import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ModerationService } from './moderation.service.js'
import { ModerationError } from './moderation.service.js'
import type { AiConfigInput, AgeConfigInput } from './moderation.schema.js'

export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof ModerationError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async getAiConfig(_request: FastifyRequest, reply: FastifyReply) {
    const result = await this.service.getAiConfig()
    return reply.send(result)
  }

  async updateAiConfig(request: FastifyRequest<{ Body: AiConfigInput }>, reply: FastifyReply) {
    try {
      const result = await this.service.updateAiConfig(request, request.body)
      return reply.send(result)
    } catch (err) { return this.handleError(err, reply) }
  }

  async clearApiKey(request: FastifyRequest, reply: FastifyReply) {
    try {
      await this.service.clearApiKey(request)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }

  async getAgeConfig(_request: FastifyRequest, reply: FastifyReply) {
    const result = await this.service.getAgeConfig()
    return reply.send(result)
  }

  async updateAgeConfig(request: FastifyRequest<{ Body: AgeConfigInput }>, reply: FastifyReply) {
    try {
      const result = await this.service.updateAgeConfig(request, request.body)
      return reply.send(result)
    } catch (err) { return this.handleError(err, reply) }
  }
}
