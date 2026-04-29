import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { IEmailService } from '../../contracts/email.service.contract.js'

export class SESAdapter implements IEmailService {
  private readonly client: SESClient

  constructor(
    private readonly fromEmail: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  async sendEmailVerification(to: string, verificationUrl: string): Promise<void> {
    await this.client.send(new SendEmailCommand({
      Source: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: 'Confirme seu e-mail — Geek Social' },
        Body: {
          Html: {
            Data: `<p>Clique no link para verificar seu e-mail:</p>
                   <a href="${verificationUrl}">${verificationUrl}</a>
                   <p>O link expira em 24 horas.</p>`,
          },
        },
      },
    }))
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.client.send(new SendEmailCommand({
      Source: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: 'Redefinição de senha — Geek Social' },
        Body: {
          Html: {
            Data: `<p>Clique no link para redefinir sua senha:</p>
                   <a href="${resetUrl}">${resetUrl}</a>
                   <p>O link expira em 1 hora. Se não foi você, ignore este e-mail.</p>`,
          },
        },
      },
    }))
  }
}
