import { PgBoss, type Job } from 'pg-boss'
import type {
  IJobsQueue, JobName, JobOptions, WorkerOptions, BatchStats,
} from '../../contracts/jobs-queue.contract.js'

export class PgBossAdapter implements IJobsQueue {
  private readonly boss: PgBoss
  private started = false

  constructor(connectionString: string) {
    this.boss = new PgBoss({ connectionString })
  }

  async start(): Promise<void> {
    if (this.started) return
    await this.boss.start()
    await this.boss.createQueue('steam.import-game')
    await this.boss.createQueue('steam.enrich-game')
    this.started = true
  }

  async stop(): Promise<void> {
    if (!this.started) return
    await this.boss.stop({ graceful: true, timeout: 10_000 })
    this.started = false
  }

  async enqueue<T>(jobName: JobName, payload: T, options?: JobOptions): Promise<string | null> {
    const sendOptions: Record<string, unknown> = {}
    if (options?.retryLimit !== undefined) sendOptions.retryLimit = options.retryLimit
    if (options?.retryDelay !== undefined) sendOptions.retryDelay = options.retryDelay
    if (options?.retryBackoff !== undefined) sendOptions.retryBackoff = options.retryBackoff
    if (options?.startAfterSeconds !== undefined) sendOptions.startAfter = options.startAfterSeconds
    return this.boss.send(jobName, payload as object, sendOptions)
  }

  async registerWorker<T>(
    jobName: JobName,
    handler: (payload: T) => Promise<void>,
    options?: WorkerOptions,
  ): Promise<void> {
    const workOptions = {
      batchSize: options?.batchSize ?? 1,
      localConcurrency: options?.teamConcurrency ?? options?.teamSize ?? 1,
    }
    await this.boss.work<T>(jobName, workOptions, async (jobs: Job<T>[]) => {
      for (const job of jobs) {
        await handler(job.data)
      }
    })
  }

  async getBatchStats(importBatchId: string): Promise<BatchStats> {
    const db = this.boss.getDb()
    const { rows } = await db.executeSql(
      `SELECT name, state, count(*)::int AS c
       FROM pgboss.job
       WHERE data->>'importBatchId' = $1
       GROUP BY name, state`,
      [importBatchId],
    )
    const stats: BatchStats = {
      totalImports: 0, completedImports: 0, failedImports: 0,
      totalEnriches: 0, completedEnriches: 0, failedEnriches: 0,
    }
    for (const row of rows as Array<{ name: string; state: string; c: number }>) {
      const isImport = row.name === 'steam.import-game'
      const isEnrich = row.name === 'steam.enrich-game'
      if (!isImport && !isEnrich) continue
      const c = Number(row.c)
      if (isImport) {
        stats.totalImports += c
        if (row.state === 'completed') stats.completedImports += c
        if (row.state === 'failed' || row.state === 'cancelled') stats.failedImports += c
      } else {
        stats.totalEnriches += c
        if (row.state === 'completed') stats.completedEnriches += c
        if (row.state === 'failed' || row.state === 'cancelled') stats.failedEnriches += c
      }
    }
    return stats
  }

  async hasActiveBatchForUser(userId: string): Promise<boolean> {
    const db = this.boss.getDb()
    const { rows } = await db.executeSql(
      `SELECT 1
       FROM pgboss.job
       WHERE name IN ('steam.import-game', 'steam.enrich-game')
         AND state IN ('created', 'retry', 'active')
         AND data->>'userId' = $1
       LIMIT 1`,
      [userId],
    )
    return rows.length > 0
  }
}
