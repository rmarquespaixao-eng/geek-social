const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i

/** Detecta se a URL aponta pra um vídeo (pela extensão). */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return VIDEO_EXT_RE.test(url)
}

export function inferMediaType(url: string): 'image' | 'video' {
  return isVideoUrl(url) ? 'video' : 'image'
}

/**
 * Baixa um arquivo da URL para o computador do usuário.
 * Usa fetch + blob para garantir o download mesmo quando a URL aponta para outra origem
 * (o atributo `download` é ignorado em links cross-origin).
 */
export async function downloadFile(url: string, suggestedName?: string): Promise<void> {
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = suggestedName ?? deriveFilenameFromUrl(url)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    // Fallback: abre em nova aba se o fetch falhar (CORS por exemplo)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function deriveFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href)
    const name = u.pathname.split('/').filter(Boolean).pop()
    return name && name.length > 0 ? decodeURIComponent(name) : 'download'
  } catch {
    return 'download'
  }
}
