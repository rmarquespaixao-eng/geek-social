import { api } from '@/shared/http/api'

export interface IgdbGame {
  id: number
  name: string
  coverUrl: string | null
  coverImageId: string | null
  genre: string | null
  platform: string | null
  releaseYear: number | null
  developer: string | null
}

export async function searchIgdbGames(query: string): Promise<IgdbGame[]> {
  const res = await api.get(`/integrations/igdb/search?q=${encodeURIComponent(query)}`)
  return res.data as IgdbGame[]
}
