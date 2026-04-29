export function extractApiError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const axiosMsg = (e as any).response?.data?.message
    if (axiosMsg) return axiosMsg
    const msg = (e as Error).message
    if (msg) return msg
  }
  return fallback
}
