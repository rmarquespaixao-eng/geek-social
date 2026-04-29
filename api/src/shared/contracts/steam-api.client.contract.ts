export type SteamOwnedGame = {
  appId: number
  name: string
  playtimeForever: number // minutos
  imgIconUrl: string | null
}

export type SteamAppDetails = {
  appId: number
  type: string
  name: string
  shortDescription: string | null
  releaseDateRaw: string | null
  developers: string[]
  publishers: string[]
  genres: Array<{ id: string; description: string }>
}

export class SteamApiAuthError extends Error {
  constructor() { super('STEAM_AUTH_FAILED') }
}

export class SteamProfilePrivateError extends Error {
  constructor() { super('STEAM_PROFILE_PRIVATE') }
}

export interface ISteamApiClient {
  /** Requer key Web API (gerada em https://steamcommunity.com/dev/apikey). Cada usuário tem a sua. */
  getOwnedGames(steamId: string, apiKey: string): Promise<SteamOwnedGame[]>
  /** Endpoint público (storefront). Não usa key. */
  getAppDetails(appId: number): Promise<SteamAppDetails | null>
  /** CDN público. Não usa key. */
  downloadCover(appId: number): Promise<Buffer | null>
}
