import { eq, and } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { featureFlags, userFeatureFlags, users } from '../../../shared/infra/database/schema.js'
import type { CreateFlagBody, UpdateFlagBody } from './feature-flags.schema.js'

export type FeatureFlagRow = typeof featureFlags.$inferSelect
export type UserFeatureFlagRow = typeof userFeatureFlags.$inferSelect

export type FlagOverrideWithUser = {
  userId: string
  displayName: string | null
  email: string | null
  enabled: boolean
  updatedAt: Date
}

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

  // ── User overrides ────────────────────────────────────────────────

  async resolveForUser(userId: string): Promise<Record<string, boolean>> {
    const rows = await this.db
      .select({
        key: featureFlags.key,
        globalEnabled: featureFlags.enabled,
        userEnabled: userFeatureFlags.enabled,
      })
      .from(featureFlags)
      .leftJoin(
        userFeatureFlags,
        and(
          eq(userFeatureFlags.flagId, featureFlags.id),
          eq(userFeatureFlags.userId, userId),
        ),
      )
    return Object.fromEntries(
      rows.map(r => [r.key, r.userEnabled ?? r.globalEnabled]),
    )
  }

  async listFlagOverrides(flagId: string): Promise<FlagOverrideWithUser[]> {
    return this.db
      .select({
        userId: userFeatureFlags.userId,
        displayName: users.displayName,
        email: users.email,
        enabled: userFeatureFlags.enabled,
        updatedAt: userFeatureFlags.updatedAt,
      })
      .from(userFeatureFlags)
      .leftJoin(users, eq(users.id, userFeatureFlags.userId))
      .where(eq(userFeatureFlags.flagId, flagId))
      .orderBy(userFeatureFlags.updatedAt)
  }

  async setUserOverride(
    userId: string,
    flagId: string,
    enabled: boolean,
    updatedBy: string | null,
  ): Promise<UserFeatureFlagRow> {
    const [row] = await this.db
      .insert(userFeatureFlags)
      .values({ userId, flagId, enabled, updatedBy })
      .onConflictDoUpdate({
        target: [userFeatureFlags.userId, userFeatureFlags.flagId],
        set: { enabled, updatedBy, updatedAt: new Date() },
      })
      .returning()
    return row
  }

  async removeUserOverride(userId: string, flagId: string): Promise<boolean> {
    const result = await this.db
      .delete(userFeatureFlags)
      .where(
        and(
          eq(userFeatureFlags.userId, userId),
          eq(userFeatureFlags.flagId, flagId),
        ),
      )
      .returning({ id: userFeatureFlags.id })
    return result.length > 0
  }
}
