export type DmRequestStatus = 'pending' | 'accepted' | 'rejected'

export type DmRequest = {
  id: string
  senderId: string
  receiverId: string
  status: DmRequestStatus
  conversationId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface IDmRequestsRepository {
  create(senderId: string, receiverId: string): Promise<DmRequest>
  findById(id: string): Promise<DmRequest | null>
  findExisting(senderId: string, receiverId: string): Promise<DmRequest | null>
  findReceivedPending(receiverId: string): Promise<DmRequest[]>
  updateStatus(id: string, status: 'accepted' | 'rejected', conversationId?: string): Promise<DmRequest>
}
