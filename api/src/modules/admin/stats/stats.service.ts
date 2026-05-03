import type { StatsRepository } from './stats.repository.js'
import type { StatsResponse } from './stats.schema.js'

export class StatsService {
  constructor(private readonly repo: StatsRepository) {}

  async getStats(): Promise<StatsResponse> {
    return this.repo.aggregate()
  }
}
