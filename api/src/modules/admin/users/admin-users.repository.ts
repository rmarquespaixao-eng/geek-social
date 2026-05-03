import { eq, and, ilike, or, count, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { users } from '../../../shared/infra/database/schema.js'
import type { ListUsersQuery } from './admin-users.schema.js'

export type AdminUserRow = typeof users.$inferSelect

export class AdminUsersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(filters: ListUsersQuery, isAdmin: boolean): Promise<{ rows: AdminUserRow[]; total: number }> {
    const { page, pageSize } = filters
    const conditions = []

    if (filters.search) {
      const safe = filters.search.replace(/[\\%_]/g, '\\$&')
      conditions.push(or(
        ilike(users.displayName, `%${safe}%`),
        ilike(users.email, `%${safe}%`),
      ))
    }
    if (filters.role) {
      conditions.push(eq(users.platformRole, filters.role))
    }
    // status filtering via ban/suspend flags — stored implicitly in tokenVersion + email pattern
    // Para simplificar: banned users terão email pattern 'deleted-*@anonymous.invalid'
    // suspended users terão tokenVersion incrementado (sem campo status explícito)
    // Nesta entrega filtramos apenas por role; status admin-side não tem coluna dedicada ainda.

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(users).where(where),
      this.db.select().from(users).where(where)
        .orderBy(sql`${users.createdAt} DESC`)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])

    return { rows, total: Number(totalRes[0]?.count ?? 0) }
  }

  async findById(id: string): Promise<AdminUserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ?? null
  }

  async updateRole(id: string, role: 'user' | 'moderator' | 'admin'): Promise<AdminUserRow | null> {
    const [row] = await this.db.update(users)
      .set({ platformRole: role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return row ?? null
  }

  async bumpTokenVersion(id: string): Promise<void> {
    await this.db.update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, id))
  }

  async countAdmins(): Promise<number> {
    const [res] = await this.db.select({ count: count() }).from(users)
      .where(eq(users.platformRole, 'admin'))
    return Number(res?.count ?? 0)
  }

  /**
   * Anonimiza conta para LGPD: zera PII e marca email como deletado.
   * Não apaga a linha para preservar integridade referencial em logs, posts etc.
   */
  async anonymize(id: string): Promise<AdminUserRow | null> {
    const [row] = await this.db.update(users)
      .set({
        email: `deleted-${id}@anonymous.invalid`,
        displayName: 'Usuário removido',
        bio: null,
        avatarUrl: null,
        coverUrl: null,
        coverColor: null,
        profileBackgroundUrl: null,
        profileBackgroundColor: null,
        birthday: null,
        interests: [],
        pronouns: null,
        location: null,
        website: null,
        steamId: null,
        steamApiKey: null,
        googleId: null,
        passwordHash: null,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning()
    return row ?? null
  }
}
