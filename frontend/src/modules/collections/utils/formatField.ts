import { formatMoney } from './money'
import { formatLongDate, formatShortDateWithYear } from '@/shared/utils/timeAgo'

export type FieldFormatDef = {
  fieldKey: string
  fieldType: string
  selectOptions?: string[] | null
}

/**
 * Formato amigável "47h 30min" / "23min" / "1h" / "Nunca jogado".
 * Usado pra `playtime_minutes` (Steam) — minutos puros, mas mostrar humano.
 */
export function formatPlaytimeMinutes(raw: unknown): string {
  if (typeof raw !== 'number' || !isFinite(raw)) return String(raw ?? '')
  if (raw === 0) return 'Nunca jogado'
  const hours = Math.floor(raw / 60)
  const mins = raw % 60
  if (hours === 0) return `${mins}min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
}

export function formatFieldValue(
  def: FieldFormatDef,
  raw: unknown,
  opts: { dateStyle?: 'short' | 'long' } = {},
): string {
  if (def.fieldKey === 'playtime_minutes') return formatPlaytimeMinutes(raw)
  if (def.fieldType === 'boolean') return raw ? 'Sim' : 'Não'
  if (def.fieldType === 'date' && typeof raw === 'string') {
    return opts.dateStyle === 'long' ? formatLongDate(raw) : formatShortDateWithYear(raw)
  }
  if (def.fieldType === 'money') return formatMoney(raw, def.selectOptions?.[0])
  return String(raw ?? '')
}
