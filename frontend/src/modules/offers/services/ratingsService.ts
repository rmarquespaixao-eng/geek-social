import { api } from '@/shared/http/api'

export interface UserReputation {
  score: number
  count: number
}

export interface ListingRating {
  id: string
  offerId: string
  raterId: string
  rateeId: string
  score: number
  createdAt: string
  updatedAt: string
}

export async function submitRating(offerId: string, score: number): Promise<ListingRating> {
  const { data } = await api.post<ListingRating>('/ratings', { offerId, score })
  return data
}

export async function getReputation(userId: string): Promise<UserReputation> {
  const { data } = await api.get<UserReputation>(`/ratings/users/${userId}`)
  return data
}

export async function getMyRatingForOffer(offerId: string): Promise<ListingRating | null> {
  const { data } = await api.get<ListingRating | null>(`/ratings/offers/${offerId}/mine`)
  return data
}

export async function listMyRatings(): Promise<ListingRating[]> {
  const { data } = await api.get<ListingRating[]>('/ratings/mine')
  return data
}
