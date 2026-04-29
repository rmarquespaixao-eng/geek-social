import { eq, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { importBatchFinalized } from '../../../shared/infra/database/schema.js'
import type {
  IImportBatchFinalizationRepository, FinalizationData,
} from '../../../shared/contracts/import-batch-finalization.repository.contract.js'

export class ImportBatchFinalizationRepository implements IImportBatchFinalizationRepository {
  constructor(private readonly db: DatabaseClient) {}

  async finalizeOnce(data: FinalizationData): Promise<boolean> {
    const inserted = await this.db.execute(sql`
      INSERT INTO import_batch_finalized
        (batch_id, user_id, collection_id, total, imported, updated, failed)
      VALUES
        (${data.batchId}, ${data.userId}, ${data.collectionId},
         ${data.total}, ${data.imported}, ${data.updated}, ${data.failed})
      ON CONFLICT (batch_id) DO NOTHING
      RETURNING batch_id
    `)
    const rowCount = (inserted as unknown as { rowCount?: number; rows?: unknown[] }).rowCount
      ?? (inserted as unknown as { rows?: unknown[] }).rows?.length
      ?? 0
    return rowCount > 0
  }

  async findByBatchId(batchId: string) {
    const rows = await this.db.select().from(importBatchFinalized)
      .where(eq(importBatchFinalized.batchId, batchId))
      .limit(1)
    if (!rows[0]) return null
    const r = rows[0]
    return {
      batchId: r.batchId,
      userId: r.userId,
      collectionId: r.collectionId,
      total: r.total,
      imported: r.imported,
      updated: r.updated,
      failed: r.failed,
      finalizedAt: r.finalizedAt,
    }
  }
}
