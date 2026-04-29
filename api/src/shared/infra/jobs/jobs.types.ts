export type ImportGameJobPayload = {
  userId: string
  collectionId: string
  appId: number
  importBatchId: string
  expectedTotal: number
  gameSnapshot?: { name: string; playtimeForever: number }
}

export type EnrichGameJobPayload = {
  userId: string
  collectionId: string
  itemId: string
  appId: number
  importBatchId: string
  expectedTotal: number
  /** marca quantos imports e quantos enriches o batch deveria ter ao final (usado pra detecção de "último") */
  expectedTotalImports: number
  expectedTotalEnriches: number
}
