import { describe, it, expect } from 'vitest'
import { mapSteamGenreToPtBr } from '../../../../src/modules/integrations/steam/steam-genre.mapper.js'

describe('mapSteamGenreToPtBr', () => {
  it('null/undefined → null', () => {
    expect(mapSteamGenreToPtBr(null)).toBeNull()
    expect(mapSteamGenreToPtBr(undefined)).toBeNull()
  })

  it('description já em pt-BR válida: passa direto', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Indie' })).toBe('Indie')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Ação' })).toBe('Ação')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Outro' })).toBe('Outro')
  })

  it('mapeia por ID canônico da Steam', () => {
    expect(mapSteamGenreToPtBr({ id: '1', description: 'Action' })).toBe('Ação')
    expect(mapSteamGenreToPtBr({ id: '2', description: 'Strategy' })).toBe('Estratégia')
    expect(mapSteamGenreToPtBr({ id: '3', description: 'RPG' })).toBe('RPG')
    expect(mapSteamGenreToPtBr({ id: '9', description: 'Racing' })).toBe('Corrida')
    expect(mapSteamGenreToPtBr({ id: '18', description: 'Sports' })).toBe('Esportes')
    expect(mapSteamGenreToPtBr({ id: '23', description: 'Indie' })).toBe('Indie')
    expect(mapSteamGenreToPtBr({ id: '25', description: 'Adventure' })).toBe('Aventura')
    expect(mapSteamGenreToPtBr({ id: '28', description: 'Simulation' })).toBe('Simulação')
    expect(mapSteamGenreToPtBr({ id: '29', description: 'Massively Multiplayer' })).toBe('MMORPG')
  })

  it('match por description exata em inglês quando ID desconhecido', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Action' })).toBe('Ação')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Adventure' })).toBe('Aventura')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Strategy' })).toBe('Estratégia')
  })

  it('match por substring para descriptions compostas', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Action-Adventure' })).toBe('Ação-Aventura')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'First-Person Shooter' })).toBe('FPS')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Survival Horror' })).toBe('Survival Horror')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Open World Adventure' })).toBe('Mundo Aberto')
  })

  it('case-insensitive', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'ACTION' })).toBe('Ação')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'rpg' })).toBe('RPG')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Indie ' })).toBe('Indie')
  })

  it('valor desconhecido cai em "Outro"', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Free to Play' })).toBe('Outro')
    expect(mapSteamGenreToPtBr({ id: '70', description: 'Early Access' })).toBe('Outro')
    expect(mapSteamGenreToPtBr({ id: '4', description: 'Casual' })).toBe('Outro')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Animation & Modeling' })).toBe('Outro')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Some Random Genre' })).toBe('Outro')
  })

  it('"horror" não confunde com "Survival Horror"', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Survival Horror' })).toBe('Survival Horror')
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Horror' })).toBe('Terror')
  })

  it('"shooter" sem "first-person" cai em FPS (heurística)', () => {
    expect(mapSteamGenreToPtBr({ id: '999', description: 'Shooter' })).toBe('FPS')
  })
})
