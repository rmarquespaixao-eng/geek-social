export class ChatError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ChatError'
  }
}
