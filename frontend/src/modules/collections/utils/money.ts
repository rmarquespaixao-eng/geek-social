export type CurrencyCode =
  | 'BRL' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY'
  | 'KRW' | 'CAD' | 'AUD' | 'CHF' | 'MXN' | 'ARS'

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string; locale: string }[] = [
  { code: 'BRL', label: 'Real Brasileiro',     symbol: 'R$',  locale: 'pt-BR' },
  { code: 'USD', label: 'Dólar Americano',     symbol: 'US$', locale: 'en-US' },
  { code: 'EUR', label: 'Euro',                symbol: '€',   locale: 'de-DE' },
  { code: 'GBP', label: 'Libra Esterlina',     symbol: '£',   locale: 'en-GB' },
  { code: 'JPY', label: 'Iene Japonês',        symbol: '¥',   locale: 'ja-JP' },
  { code: 'CNY', label: 'Yuan Chinês',         symbol: 'CN¥', locale: 'zh-CN' },
  { code: 'KRW', label: 'Won Sul-coreano',     symbol: '₩',   locale: 'ko-KR' },
  { code: 'CAD', label: 'Dólar Canadense',     symbol: 'C$',  locale: 'en-CA' },
  { code: 'AUD', label: 'Dólar Australiano',   symbol: 'A$',  locale: 'en-AU' },
  { code: 'CHF', label: 'Franco Suíço',        symbol: 'CHF', locale: 'de-CH' },
  { code: 'MXN', label: 'Peso Mexicano',       symbol: 'Mex$', locale: 'es-MX' },
  { code: 'ARS', label: 'Peso Argentino',      symbol: 'AR$', locale: 'es-AR' },
]

export function findCurrency(code?: string | null) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
}

/** Formata um número como dinheiro usando Intl.NumberFormat. */
export function formatMoney(amount: unknown, code?: string | null): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!isFinite(n)) return ''
  const currency = findCurrency(code)
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
    }).format(n)
  } catch {
    return `${currency.symbol} ${n.toFixed(2)}`
  }
}
