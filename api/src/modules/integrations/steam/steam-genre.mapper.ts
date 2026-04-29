/**
 * Mapeia o gênero retornado pela Storefront API da Steam para uma das opções
 * pt-BR aceitas pelo field `genre` da coleção `games` (ver
 * `shared/infra/database/seeds/field-definitions.seed.ts`).
 *
 * A Steam devolve `description` em inglês (`"Action"`, `"Strategy"`, …) e o
 * field `genre` é do tipo `select` com opções fechadas em pt-BR — sem o
 * mapping, qualquer item importado fica com valor inválido e estoura
 * `INVALID_FIELD_VALUE` (422) ao ser editado pelo usuário.
 *
 * Estratégia, em ordem:
 *  1. `description` já é uma opção pt-BR válida (caso a Steam retorne
 *     localizado) → usa direto.
 *  2. Match por ID da Steam (estável, não depende de locale).
 *  3. Match exato por description normalizada (lowercase).
 *  4. Substring (cobre composições tipo "Action-Adventure", "First-Person
 *     Shooter", etc.).
 *  5. Fallback `'Outro'` (também opção válida do select).
 */

const SEED_OPTIONS = new Set([
  'Ação',
  'Ação-Aventura',
  'Aventura',
  'Battle Royale',
  'Corrida',
  'Esportes',
  'Estratégia',
  'FPS',
  'Indie',
  'Luta',
  'MMORPG',
  'MOBA',
  'Metroidvania',
  'Mundo Aberto',
  'Plataforma',
  'Puzzle',
  'RPG',
  'Roguelike',
  'Simulação',
  'Souls-like',
  'Survival Horror',
  'Terror',
  'Outro',
])

// IDs canônicos da Storefront API da Steam.
// Referência: docs informais agregadas em https://partner.steamgames.com/doc/store/application/genres
const BY_STEAM_ID: Record<string, string> = {
  '1':  'Ação',
  '2':  'Estratégia',
  '3':  'RPG',
  '9':  'Corrida',
  '18': 'Esportes',
  '23': 'Indie',
  '25': 'Aventura',
  '28': 'Simulação',
  '29': 'MMORPG',
}

// Match por keyword na description normalizada (lowercase, trimmed).
// Ordem importa para o fallback por substring na função: keys mais
// específicas primeiro evitam match prematuro (ex.: "first-person shooter"
// antes de "shooter"; "survival horror" antes de "horror").
const BY_DESCRIPTION_LC: Array<[string, string]> = [
  ['battle royale', 'Battle Royale'],
  ['first-person shooter', 'FPS'],
  ['first person shooter', 'FPS'],
  ['action-adventure', 'Ação-Aventura'],
  ['action adventure', 'Ação-Aventura'],
  ['survival horror', 'Survival Horror'],
  ['massively multiplayer', 'MMORPG'],
  ['role-playing', 'RPG'],
  ['role playing', 'RPG'],
  ['open world', 'Mundo Aberto'],
  ['souls-like', 'Souls-like'],
  ['soulslike', 'Souls-like'],
  ['metroidvania', 'Metroidvania'],
  ['platformer', 'Plataforma'],
  ['platform', 'Plataforma'],
  ['simulation', 'Simulação'],
  ['adventure', 'Aventura'],
  ['strategy', 'Estratégia'],
  ['fighting', 'Luta'],
  ['racing', 'Corrida'],
  ['sports', 'Esportes'],
  ['shooter', 'FPS'],
  ['action', 'Ação'],
  ['indie', 'Indie'],
  ['rpg', 'RPG'],
  ['mmo', 'MMORPG'],
  ['moba', 'MOBA'],
  ['fps', 'FPS'],
  ['puzzle', 'Puzzle'],
  ['roguelike', 'Roguelike'],
  ['horror', 'Terror'],
]

export type SteamGenre = { id: string; description: string }

export function mapSteamGenreToPtBr(genre: SteamGenre | null | undefined): string | null {
  if (!genre) return null
  if (SEED_OPTIONS.has(genre.description)) return genre.description

  const byId = BY_STEAM_ID[genre.id]
  if (byId) return byId

  const lc = genre.description.toLowerCase().trim()
  for (const [keyword, ptBr] of BY_DESCRIPTION_LC) {
    if (lc === keyword) return ptBr
  }
  for (const [keyword, ptBr] of BY_DESCRIPTION_LC) {
    if (lc.includes(keyword)) return ptBr
  }

  return 'Outro'
}
