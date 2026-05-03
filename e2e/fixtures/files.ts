// PNG 1×1 transparente (67 bytes) — válido pra MIME=image/png e size<5MB.
// Playwright aceita arquivos em memória, sem precisar de arquivos no disco.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII='

export function tinyPng(name = 'tiny.png') {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  }
}
