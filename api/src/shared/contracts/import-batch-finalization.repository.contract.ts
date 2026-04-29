export type FinalizationData = {
  batchId: string
  userId: string
  collectionId: string
  total: number
  imported: number
  updated: number
  failed: number
}

export interface IImportBatchFinalizationRepository {
  /**
   * Insere a finalização. Retorna `true` se a inserção ocorreu (caller é o vencedor),
   * ou `false` se já existia (alguém finalizou primeiro). Idempotente.
   */
  finalizeOnce(data: FinalizationData): Promise<boolean>
  findByBatchId(batchId: string): Promise<(FinalizationData & { finalizedAt: Date }) | null>
}
