import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SteamOpenIdAdapter } from '../../../../src/modules/integrations/steam/steam.openid.adapter.js'

const STEAM_ID = '76561198000000001'
const OP_ENDPOINT = 'https://steamcommunity.com/openid/login'

describe('SteamOpenIdAdapter', () => {
  let adapter: SteamOpenIdAdapter
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    adapter = new SteamOpenIdAdapter()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  describe('buildAuthUrl', () => {
    it('monta URL OpenID 2.0 com todos os params obrigatórios', () => {
      const url = adapter.buildAuthUrl('https://api.example.com/callback', 'https://api.example.com')
      expect(url.startsWith(`${OP_ENDPOINT}?`)).toBe(true)
      const params = new URL(url).searchParams
      expect(params.get('openid.ns')).toBe('http://specs.openid.net/auth/2.0')
      expect(params.get('openid.mode')).toBe('checkid_setup')
      expect(params.get('openid.return_to')).toBe('https://api.example.com/callback')
      expect(params.get('openid.realm')).toBe('https://api.example.com')
      expect(params.get('openid.identity')).toBe('http://specs.openid.net/auth/2.0/identifier_select')
      expect(params.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select')
    })
  })

  describe('verifyResponse', () => {
    function validQuery(): Record<string, string> {
      return {
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': OP_ENDPOINT,
        'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
        'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
        'openid.return_to': 'https://api.example.com/callback',
        'openid.response_nonce': '2026-04-26T00:00:00Zabc',
        'openid.assoc_handle': '1234567890',
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'fake-sig',
      }
    }

    it('retorna null se mode != id_res', async () => {
      const q = validQuery()
      q['openid.mode'] = 'cancel'
      const result = await adapter.verifyResponse(q)
      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('retorna null se claimed_id ausente', async () => {
      const q = validQuery()
      delete (q as Record<string, string | undefined>)['openid.claimed_id']
      const result = await adapter.verifyResponse(q as Record<string, string>)
      expect(result).toBeNull()
    })

    it('retorna null se claimed_id malformado (host errado)', async () => {
      const q = validQuery()
      q['openid.claimed_id'] = 'https://attacker.com/openid/id/76561198000000001'
      const result = await adapter.verifyResponse(q)
      expect(result).toBeNull()
    })

    it('retorna null se claimed_id sem 17 dígitos', async () => {
      const q = validQuery()
      q['openid.claimed_id'] = 'https://steamcommunity.com/openid/id/12345'
      const result = await adapter.verifyResponse(q)
      expect(result).toBeNull()
    })

    it('chama Steam com mode=check_authentication e retorna steamId quando is_valid:true', async () => {
      fetchSpy.mockResolvedValue(new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', {
        status: 200,
      }))
      const result = await adapter.verifyResponse(validQuery())
      expect(result).toEqual({ steamId: STEAM_ID })

      expect(fetchSpy).toHaveBeenCalledOnce()
      const [url, init] = fetchSpy.mock.calls[0]
      expect(url).toBe(OP_ENDPOINT)
      const opts = init as RequestInit
      expect(opts.method).toBe('POST')
      const body = new URLSearchParams(opts.body as string)
      expect(body.get('openid.mode')).toBe('check_authentication')
      expect(body.get('openid.claimed_id')).toBe(`https://steamcommunity.com/openid/id/${STEAM_ID}`)
    })

    it('retorna null quando Steam responde is_valid:false', async () => {
      fetchSpy.mockResolvedValue(new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n', {
        status: 200,
      }))
      const result = await adapter.verifyResponse(validQuery())
      expect(result).toBeNull()
    })

    it('retorna null quando Steam responde com status não-OK', async () => {
      fetchSpy.mockResolvedValue(new Response('boom', { status: 503 }))
      const result = await adapter.verifyResponse(validQuery())
      expect(result).toBeNull()
    })

    it('retorna null quando fetch falha (rede caiu)', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNRESET'))
      const result = await adapter.verifyResponse(validQuery())
      expect(result).toBeNull()
    })
  })
})
