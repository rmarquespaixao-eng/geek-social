export interface IOpenIdVerifier {
  buildAuthUrl(returnUrl: string, realm: string): string
  verifyResponse(query: Record<string, string>): Promise<{ steamId: string } | null>
}
