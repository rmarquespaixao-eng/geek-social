export interface IEmailService {
  sendEmailVerification(to: string, verificationUrl: string): Promise<void>
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>
}
