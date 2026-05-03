import type { CollectionTypesRepository } from './collection-types.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { CollectionTypeInput, CollectionTypeUpdate, ListCollectionTypesQuery } from './collection-types.schema.js'

export class CollectionTypeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'CollectionTypeError'
  }
}

export class CollectionTypesService {
  constructor(
    private readonly repo: CollectionTypesRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(query: ListCollectionTypesQuery) {
    const { rows, total } = await this.repo.findAll({
      page: query.page,
      limit: query.limit,
      active: query.active,
    })
    return {
      data: rows,
      total,
      page: query.page,
      limit: query.limit,
    }
  }

  async getById(id: string) {
    const row = await this.repo.findById(id)
    if (!row) throw new CollectionTypeError('NOT_FOUND', 'Tipo de coleção não encontrado', 404)
    return row
  }

  async create(request: FastifyRequest, input: CollectionTypeInput) {
    const existing = await this.repo.findByKey(input.key)
    if (existing) throw new CollectionTypeError('KEY_CONFLICT', `Já existe um tipo com a chave "${input.key}"`, 409)

    const row = await this.repo.create({
      key: input.key,
      name: input.name ?? null,
      description: input.description ?? null,
      icon: input.icon ?? null,
      active: input.active ?? true,
    })

    await this.auditLog.recordFromRequest(request, 'collection_type_create', {
      targetType: 'collection_type',
      targetId: row.id,
    })

    return row
  }

  async update(request: FastifyRequest, id: string, input: CollectionTypeUpdate) {
    const existing = await this.repo.findById(id)
    if (!existing) throw new CollectionTypeError('NOT_FOUND', 'Tipo de coleção não encontrado', 404)

    if (existing.isSystem) {
      if (input.active === false) {
        throw new CollectionTypeError('SYSTEM_LOCKED', 'Tipos de coleção do sistema não podem ser desativados', 422)
      }
    }

    const row = await this.repo.update(id, {
      name: input.name,
      description: input.description,
      icon: input.icon,
      active: input.active,
    })

    await this.auditLog.recordFromRequest(request, 'collection_type_update', {
      targetType: 'collection_type',
      targetId: id,
    })

    return row!
  }

  async delete(request: FastifyRequest, id: string) {
    const existing = await this.repo.findById(id)
    if (!existing) throw new CollectionTypeError('NOT_FOUND', 'Tipo de coleção não encontrado', 404)

    if (existing.isSystem) {
      throw new CollectionTypeError('SYSTEM_LOCKED', 'Tipos de coleção do sistema não podem ser removidos', 422)
    }

    const usageCount = await this.repo.countCollectionsByTypeId(id)
    if (usageCount > 0) {
      throw new CollectionTypeError(
        'TYPE_IN_USE',
        `Este tipo está em uso por ${usageCount} coleção(ões) e não pode ser removido`,
        409,
      )
    }

    const deleted = await this.repo.delete(id)
    if (!deleted) throw new CollectionTypeError('DELETE_FAILED', 'Falha ao remover tipo de coleção', 500)

    await this.auditLog.recordFromRequest(request, 'collection_type_delete', {
      targetType: 'collection_type',
      targetId: id,
    })
  }
}
