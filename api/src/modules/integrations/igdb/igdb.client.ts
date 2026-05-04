const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API_URL = 'https://api.igdb.com/v4'

const PLATFORM_MAP: Record<string, string> = {
  'PlayStation': 'PS1',
  'PlayStation 2': 'PS2',
  'PlayStation 3': 'PS3',
  'PlayStation 4': 'PS4',
  'PlayStation 5': 'PS5',
  'Xbox': 'Xbox',
  'Xbox 360': 'Xbox 360',
  'Xbox One': 'Xbox One',
  'Xbox Series X|S': 'Xbox Series',
  'Nintendo Switch': 'Nintendo Switch',
  'PC (Microsoft Windows)': 'PC',
  'Android': 'Mobile',
  'iOS': 'Mobile',
}

const GENRE_MAP: Record<string, string> = {
  'Action': 'Ação',
  'Shooter': 'Ação',
  'Hack and slash/Beat \'em up': 'Ação',
  'Arcade': 'Ação',
  'Adventure': 'Aventura',
  'Point-and-click': 'Aventura',
  'Visual Novel': 'Aventura',
  'Role-playing (RPG)': 'RPG',
  'Strategy': 'Estratégia',
  'Turn-based strategy (TBS)': 'Estratégia',
  'Real Time Strategy (RTS)': 'Estratégia',
  'Tactical': 'Estratégia',
  'MOBA': 'Estratégia',
  'Sport': 'Esporte',
  'Racing': 'Corrida',
  'Fighting': 'Luta',
  'Platform': 'Plataforma',
  'Puzzle': 'Puzzle',
  'Simulator': 'Simulação',
  'Indie': 'Indie',
}

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

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  const res = await fetch(
    `${TOKEN_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`IGDB token error: ${res.status}`)

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return cachedToken.value
}

function mapCoverUrl(raw: string | undefined, size: 't_cover_big' | 't_thumb' = 't_cover_big'): { url: string | null; imageId: string | null } {
  if (!raw) return { url: null, imageId: null }
  const full = raw.startsWith('//') ? `https:${raw}` : raw
  const imageId = full.split('/').pop()?.replace('.jpg', '') ?? null
  const url = `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`
  return { url, imageId }
}

function mapGame(raw: any): IgdbGame {
  const { url: coverUrl, imageId: coverImageId } = mapCoverUrl(raw.cover?.url)

  const igdbPlatform = (raw.platforms as { name: string }[] | undefined)?.[0]?.name ?? null
  const platform = igdbPlatform ? (PLATFORM_MAP[igdbPlatform] ?? null) : null

  const igdbGenre = (raw.genres as { name: string }[] | undefined)?.[0]?.name ?? null
  const genre = igdbGenre ? (GENRE_MAP[igdbGenre] ?? null) : null

  const releaseYear = raw.first_release_date
    ? new Date(raw.first_release_date * 1000).getFullYear()
    : null

  const developer = (raw.involved_companies as { developer: boolean; company: { name: string } }[] | undefined)
    ?.find(c => c.developer)?.company?.name ?? null

  return { id: raw.id, name: raw.name, coverUrl, coverImageId, genre, platform, releaseYear, developer }
}

export async function searchGames(clientId: string, clientSecret: string, query: string): Promise<IgdbGame[]> {
  const token = await getToken(clientId, clientSecret)
  const safe = query.replace(/"/g, '').slice(0, 100)

  const res = await fetch(`${API_URL}/games`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `
      fields name,cover.url,genres.name,platforms.name,first_release_date,involved_companies.company.name,involved_companies.developer;
      search "${safe}";
      limit 8;
    `,
  })
  if (!res.ok) throw new Error(`IGDB search error: ${res.status}`)

  const games = await res.json() as any[]
  return games.map(mapGame)
}
