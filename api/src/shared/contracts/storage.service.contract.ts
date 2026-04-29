export interface IStorageService {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>
  delete(key: string): Promise<void>
  /** Extrai a `key` interna a partir de uma URL pública retornada por `upload`. Retorna `null` se a URL não pertence a este storage. */
  keyFromUrl(url: string): string | null
}
