import type { FastifyRequest, FastifyReply } from 'fastify'
import type { StatsService } from './stats.service.js'

export class StatsController {
  constructor(private readonly service: StatsService) {}

  async getStats(_request: FastifyRequest, reply: FastifyReply) {
    const stats = await this.service.getStats()
    return reply.send(stats)
  }
}
