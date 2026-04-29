import type {
  ISteamApiClient, SteamOwnedGame, SteamAppDetails,
} from '../../../shared/contracts/steam-api.client.contract.js'
import { SteamApiAuthError, SteamProfilePrivateError } from '../../../shared/contracts/steam-api.client.contract.js'

const APPDETAILS_THROTTLE_MS = 700

export class SteamApiClient implements ISteamApiClient {
  private lastAppDetailsCall = 0
  private appDetailsQueue: Promise<unknown> = Promise.resolve()

  async getOwnedGames(steamId: string, apiKey: string): Promise<SteamOwnedGame[]> {
    if (!apiKey) throw new SteamApiAuthError()
    const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('steamid', steamId)
    url.searchParams.set('include_appinfo', '1')
    url.searchParams.set('include_played_free_games', '1')
    url.searchParams.set('format', 'json')
    const res = await fetch(url.toString())
    if (res.status === 401 || res.status === 403) throw new SteamApiAuthError()
    if (!res.ok) throw new Error(`STEAM_API_ERROR ${res.status}`)
    const json = await res.json() as {
      response?: {
        game_count?: number
        games?: Array<{
          appid: number
          name?: string
          playtime_forever?: number
          img_icon_url?: string
        }>
      }
    }
    const response = json.response ?? {}
    if (!response.games || response.games.length === 0) {
      // game_count 0 OU sem array games = perfil privado
      throw new SteamProfilePrivateError()
    }
    return response.games.map(g => ({
      appId: g.appid,
      name: g.name ?? '',
      playtimeForever: g.playtime_forever ?? 0,
      imgIconUrl: g.img_icon_url ?? null,
    }))
  }

  async getAppDetails(appId: number): Promise<SteamAppDetails | null> {
    return this.serializeAppDetailsCall(() => this.fetchAppDetails(appId))
  }

  private serializeAppDetailsCall<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.appDetailsQueue.then(async () => {
      const wait = Math.max(0, this.lastAppDetailsCall + APPDETAILS_THROTTLE_MS - Date.now())
      if (wait > 0) await new Promise<void>(r => setTimeout(r, wait))
      this.lastAppDetailsCall = Date.now()
      return fn()
    })
    this.appDetailsQueue = next.catch(() => {})
    return next
  }

  private async fetchAppDetails(appId: number): Promise<SteamAppDetails | null> {
    const url = new URL('https://store.steampowered.com/api/appdetails')
    url.searchParams.set('appids', String(appId))
    url.searchParams.set('cc', 'us')
    url.searchParams.set('l', 'en')
    const res = await fetch(url.toString())
    if (!res.ok) {
      if (res.status === 429) throw new Error('STEAM_RATE_LIMIT')
      return null
    }
    const json = await res.json() as Record<string, {
      success: boolean
      data?: {
        type?: string
        name?: string
        short_description?: string
        release_date?: { date?: string }
        developers?: string[]
        publishers?: string[]
        genres?: Array<{ id: string; description: string }>
      }
    }>
    const entry = json[String(appId)]
    if (!entry || !entry.success || !entry.data) return null
    const d = entry.data
    return {
      appId,
      type: d.type ?? 'unknown',
      name: d.name ?? '',
      shortDescription: d.short_description ?? null,
      releaseDateRaw: d.release_date?.date ?? null,
      developers: d.developers ?? [],
      publishers: d.publishers ?? [],
      genres: d.genres ?? [],
    }
  }

  async downloadCover(appId: number): Promise<Buffer | null> {
    const candidates = [
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
    ]
    for (const url of candidates) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          const arr = await res.arrayBuffer()
          return Buffer.from(arr)
        }
      } catch {
        // tenta próximo
      }
    }
    return null
  }
}
