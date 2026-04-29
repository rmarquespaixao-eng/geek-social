import type { OffersService } from '../../../modules/offers/offers.service.js'

const EXPIRE_AFTER_DAYS = 7

export type OffersExpireDeps = {
  offersService: OffersService
}

/**
 * Job — cancela ofertas em `accepted` paradas há mais de 7 dias sem ambos
 * os lados terem confirmado. Roda a cada hora (configurado em app.ts).
 */
export async function runOffersExpire(deps: OffersExpireDeps): Promise<void> {
  await deps.offersService.expireOldAccepted(EXPIRE_AFTER_DAYS)
}
