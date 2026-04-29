import type { IEmailService } from '../../contracts/email.service.contract.js'

export class ConsoleEmailAdapter implements IEmailService {
  async sendEmailVerification(to: string, verificationUrl: string): Promise<void> {
    console.log(`[DEV EMAIL] Verificação de e-mail para ${to}:`)
    console.log(`[DEV EMAIL] URL: ${verificationUrl}`)
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    console.log(`[DEV EMAIL] Reset de senha para ${to}:`)
    console.log(`[DEV EMAIL] URL: ${resetUrl}`)
  }
}
