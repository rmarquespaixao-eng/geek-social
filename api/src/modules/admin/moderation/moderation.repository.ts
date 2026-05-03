import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { aiModerationConfig, ageModerationConfig } from '../../../shared/infra/database/schema.js'

export type AiConfigRow = typeof aiModerationConfig.$inferSelect
export type AgeConfigRow = typeof ageModerationConfig.$inferSelect

type AiConfigUpdate = Partial<Omit<typeof aiModerationConfig.$inferInsert, 'id'>> & {
  apiKeyCiphertext?: Buffer | null
}
type AgeConfigUpdate = Partial<Omit<typeof ageModerationConfig.$inferInsert, 'id'>>

export class ModerationRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getAi(): Promise<AiConfigRow | null> {
    const [row] = await this.db.select().from(aiModerationConfig).limit(1)
    return row ?? null
  }

  async getOrSeedAi(): Promise<AiConfigRow> {
    const existing = await this.getAi()
    if (existing) return existing
    const [row] = await this.db.insert(aiModerationConfig)
      .values({})
      .onConflictDoNothing()
      .returning()
    // If onConflictDoNothing returned nothing (race), fetch again
    return row ?? (await this.getAi())!
  }

  async upsertAi(payload: AiConfigUpdate): Promise<AiConfigRow> {
    const existing = await this.getAi()
    if (existing) {
      const [row] = await this.db.update(aiModerationConfig)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(aiModerationConfig.id, existing.id))
        .returning()
      return row
    }
    const [row] = await this.db.insert(aiModerationConfig)
      .values({ ...payload })
      .returning()
    return row
  }

  async clearApiKey(): Promise<void> {
    const existing = await this.getAi()
    if (!existing) return
    await this.db.update(aiModerationConfig)
      .set({ apiKeyCiphertext: null, apiKeyIv: null, apiKeyTag: null, updatedAt: new Date() })
      .where(eq(aiModerationConfig.id, existing.id))
  }

  async getAge(): Promise<AgeConfigRow | null> {
    const [row] = await this.db.select().from(ageModerationConfig).limit(1)
    return row ?? null
  }

  async getOrSeedAge(): Promise<AgeConfigRow> {
    const existing = await this.getAge()
    if (existing) return existing
    const [row] = await this.db.insert(ageModerationConfig)
      .values({})
      .onConflictDoNothing()
      .returning()
    return row ?? (await this.getAge())!
  }

  async upsertAge(payload: AgeConfigUpdate): Promise<AgeConfigRow> {
    const existing = await this.getAge()
    if (existing) {
      const [row] = await this.db.update(ageModerationConfig)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(ageModerationConfig.id, existing.id))
        .returning()
      return row
    }
    const [row] = await this.db.insert(ageModerationConfig)
      .values({ ...payload })
      .returning()
    return row
  }
}
