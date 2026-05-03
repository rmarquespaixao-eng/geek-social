import type { AccessTokenClaims } from '../../modules/auth/auth.service.js'
import type { PlatformRole } from '../middleware/require-role.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AccessTokenClaims & { platformRole?: PlatformRole }
  }
}
