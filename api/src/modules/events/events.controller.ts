import type { FastifyRequest, FastifyReply } from 'fastify'
import type { EventsService, CoverUpload } from './events.service.js'
import { EventsError } from './events.errors.js'
import {
  cancelEventSchema,
  createEventSchema,
  listEventsQuerySchema,
  myEventsQuerySchema,
  updateEventSchema,
} from './events.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

const STATUS_BY_CODE: Record<string, number> = {
  EVENT_NOT_FOUND: 404,
  PARTICIPATION_NOT_FOUND: 404,
  NOT_HOST: 403,
  NOT_INVITED: 403,
  EVENT_CANCELLED: 403,
  TIME_CONFLICT: 409,
  ALREADY_SUBSCRIBED: 409,
  EVENT_ALREADY_STARTED: 409,
  INVALID_PARTICIPATION_STATE: 409,
  INVALID_DURATION: 422,
  INVALID_CAPACITY: 422,
  MISSING_ADDRESS_FOR_PRESENCIAL: 422,
  MISSING_MEETING_URL_FOR_ONLINE: 422,
  UNSUPPORTED_MEDIA_FORMAT: 422,
  MEDIA_TOO_LARGE: 422,
  STORAGE_NOT_CONFIGURED: 503,
  INVALID_COVER: 422,
}

export function mapEventsError(e: unknown, reply: FastifyReply) {
  if (e instanceof EventsError) {
    const status = STATUS_BY_CODE[e.code] ?? 400
    return reply.status(status).send({ error: e.code })
  }
  throw e
}

/**
 * Lê os campos multipart e separa o arquivo `cover` dos outros campos.
 * Outros campos são acumulados em um objeto raw — números/booleans/JSON
 * passam por coerção do Zod no schema. Campos aninhados (address, online)
 * podem chegar como JSON string OU como pares "address[cep]" / "address.cep".
 */
async function parseMultipartEvent(
  request: FastifyRequest,
): Promise<{ cover: CoverUpload | null; raw: Record<string, unknown> }> {
  const raw: Record<string, unknown> = {}
  let cover: CoverUpload | null = null

  const parts = request.parts()
  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'cover') {
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk as Buffer)
        cover = { buffer: Buffer.concat(chunks), mimeType: part.mimetype }
      } else {
        // Drain unwanted file
        for await (const _ of part.file) { /* consume */ }
      }
    } else {
      const fieldname = part.fieldname
      const value = part.value
      // Tenta parse JSON pra address/online vindos como string
      if ((fieldname === 'address' || fieldname === 'online') && typeof value === 'string') {
        try {
          raw[fieldname] = JSON.parse(value)
          continue
        } catch {
          raw[fieldname] = value
          continue
        }
      }
      raw[fieldname] = value
    }
  }
  return { cover, raw }
}

export class EventsController {
  constructor(private readonly service: EventsService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      let cover: CoverUpload | null = null
      let body: unknown = request.body

      if (request.isMultipart && request.isMultipart()) {
        const parsed = await parseMultipartEvent(request)
        cover = parsed.cover
        body = parsed.raw
      }

      const parsed = createEventSchema.safeParse(body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
      }
      if (!cover) {
        return reply.status(422).send({ error: 'INVALID_COVER' })
      }
      const event = await this.service.createEvent(userId, parsed.data, cover)
      return reply.status(201).send(event)
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = listEventsQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_QUERY' })
    const result = await this.service.listEvents(userId, q.data)
    return reply.send(result)
  }

  async get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const event = await this.service.getEvent(userId, request.params.id)
      return reply.send(event)
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      let cover: CoverUpload | null = null
      let body: unknown = request.body

      if (request.isMultipart && request.isMultipart()) {
        const parsed = await parseMultipartEvent(request)
        cover = parsed.cover
        body = parsed.raw
      }

      const parsed = updateEventSchema.safeParse(body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
      }
      const result = await this.service.updateEvent(userId, request.params.id, parsed.data, cover)
      return reply.send({
        event: result.event,
        sensitiveChanged: result.sensitiveChanged,
      })
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async cancel(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = cancelEventSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    }
    try {
      await this.service.cancelEvent(userId, request.params.id, parsed.data.reason ?? null)
      return reply.status(204).send()
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async listHosted(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = myEventsQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_QUERY' })
    const result = await this.service.listHosted(userId, q.data)
    return reply.send(result)
  }

  async listAttending(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = myEventsQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_QUERY' })
    const result = await this.service.listAttending(userId, q.data)
    return reply.send(result)
  }
}
