/** HTTP status codes mapped in STATUS_BY_CODE (communities.controller.ts). */
export class CommunitiesError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code)
    this.name = 'CommunitiesError'
  }
}
