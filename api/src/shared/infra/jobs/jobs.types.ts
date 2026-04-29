export type ImportGameJobPayload = {
  userId: string
  collectionId: string
  appId: number
  importBatchId: string
  expectedTotal: number
  gameSnapshot?: { name: string; playtimeForever: number }
}
