import type { IOpenIdVerifier } from '../../../shared/contracts/openid-verifier.contract.js'

const OP_ENDPOINT = 'https://steamcommunity.com/openid/login'
const CLAIMED_ID_REGEX = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

export class SteamOpenIdAdapter implements IOpenIdVerifier {
  buildAuthUrl(returnUrl: string, realm: string): string {
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    })
    return `${OP_ENDPOINT}?${params.toString()}`
  }

  async verifyResponse(query: Record<string, string>): Promise<{ steamId: string } | null> {
    if (query['openid.mode'] !== 'id_res') return null

    const claimedId = query['openid.claimed_id']
    if (!claimedId) return null
    const match = claimedId.match(CLAIMED_ID_REGEX)
    if (!match) return null
    const steamId = match[1]

    const checkParams = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (k.startsWith('openid.')) checkParams.set(k, v)
    }
    checkParams.set('openid.mode', 'check_authentication')

    try {
      const res = await fetch(OP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: checkParams.toString(),
      })
      if (!res.ok) return null
      const text = await res.text()
      const isValid = text.split('\n').some(line => line.trim() === 'is_valid:true')
      return isValid ? { steamId } : null
    } catch {
      return null
    }
  }
}
