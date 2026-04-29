export type JobName =
  | 'steam.import-game'
  | 'steam.enrich-game'
  | 'event.reminder_48h'
  | 'event.reminder_2h'

export type JobOptions = {
  retryLimit?: number
  retryDelay?: number
  retryBackoff?: boolean
  startAfterSeconds?: number
}

export type WorkerOptions = {
  teamSize?: number
  teamConcurrency?: number
  batchSize?: number
}

export type BatchStats = {
  totalImports: number
  completedImports: number
  failedImports: number
  totalEnriches: number
  completedEnriches: number
  failedEnriches: number
}

export interface IJobsQueue {
  enqueue<T>(jobName: JobName, payload: T, options?: JobOptions): Promise<string | null>
  registerWorker<T>(
    jobName: JobName,
    handler: (payload: T) => Promise<void>,
    options?: WorkerOptions,
  ): Promise<void>
  getBatchStats(importBatchId: string): Promise<BatchStats>
  hasActiveBatchForUser(userId: string): Promise<boolean>
  /** Cancela todos os jobs pendentes (não-active) para um determinado evento. */
  cancelEventJobs(eventId: string): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}
