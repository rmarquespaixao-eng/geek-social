export type ImportProgressPayload = {
  batchId: string
  total: number
  completed: number
  failed: number
  stage: 'importing' | 'enriching' | 'done'
  currentName?: string
}

export type ImportDonePayload = {
  batchId: string
  total: number
  imported: number
  updated: number
  failed: number
  collectionId: string
  durationMs: number
}

export interface IImportProgressEmitter {
  emitProgress(userId: string, payload: ImportProgressPayload): void
  emitDone(userId: string, payload: ImportDonePayload): void
}
