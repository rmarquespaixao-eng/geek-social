-- Notification types extras:
--   * Cancelamento manual de oferta após aceite (qualquer lado pode cancelar a qualquer momento)
--   * Expiração automática (oferta accepted parada > 7 dias)
--   * Solicitação de conversa de não-amigo (DM request)
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'offer_cancelled';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'offer_expired';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'dm_request_received';
