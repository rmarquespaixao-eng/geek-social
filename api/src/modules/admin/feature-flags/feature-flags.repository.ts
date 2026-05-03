import { eq, count } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { featureFlags } from '../../../shared/infra/database/schema.js'
import type { CreateFlagBody, UpdateFlagBody } from './feature-flags.schema.js'

export type FeatureFlagRow = typeof featureFlags.$inferSelect

export class FeatureFlagsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(): Promise<FeatureFlagRow[]> {
    return this.db.select().from(featureFlags).orderBy(featureFlags.key)
  }

  async findById(id: string): Promise<FeatureFlagRow | null> {
    const [row] = await this.db.select().from(featureFlags).where(eq(featureFlags.id, id)).limit(1)
    return row ?? null
  }

  async findByKey(key: string): Promise<FeatureFlagRow | null> {
    const [row] = await this.db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1)
    return row ?? null
  }

  async create(data: CreateFlagBody, updatedBy: string | null): Promise<FeatureFlagRow> {
    const [row] = await this.db.insert(featureFlags)
      .values({
        key: data.key,
        name: data.name ?? null,
        description: data.description ?? null,
        enabled: data.enabled,
        updatedBy,
      })
      .returning()
    return row
  }

  async update(id: string, data: UpdateFlagBody, updatedBy: string): Promise<FeatureFlagRow | null> {
    const set: Partial<typeof featureFlags.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy,
    }
    if (data.enabled !== undefined) set.enabled = data.enabled
    if (data.name !== undefined) set.name = data.name
    if (data.description !== undefined) set.description = data.description

    const [row] = await this.db.update(featureFlags)
      .set(set)
      .where(eq(featureFlags.id, id))
      .returning()
    return row ?? null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(featureFlags)
      .where(eq(featureFlags.id, id))
      .returning({ id: featureFlags.id })
    return result.length > 0
  }
}
