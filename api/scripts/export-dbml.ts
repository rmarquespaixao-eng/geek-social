import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pgGenerate } from 'drizzle-dbml-generator'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { is } from 'drizzle-orm'
import { PgTable as PgTableSymbol } from 'drizzle-orm/pg-core'
import * as schemaModule from '../src/shared/infra/database/schema.js'

type ColumnInfo = {
  name: string
  dataType: string
  columnType: string
  notNull: boolean
  hasDefault: boolean
  default: string | number | boolean | null
  primary: boolean
  isUnique: boolean
}

type ForeignKeyInfo = {
  columns: string[]
  foreignTable: string
  foreignColumns: string[]
  onDelete: string | null
  onUpdate: string | null
}

type IndexInfo = {
  name: string
  unique: boolean
  columns: string[]
  where: string | null
}

type TableInfo = {
  name: string
  schema: string | null
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
  indexes: IndexInfo[]
  primaryKey: string[]
}

function serializeDefault(raw: unknown): string | number | boolean | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  if (Array.isArray(raw)) return JSON.stringify(raw)
  if (typeof raw === 'object') {
    const sql = raw as { queryChunks?: Array<{ value?: unknown[] | string }> }
    if (Array.isArray(sql.queryChunks)) {
      const text = sql.queryChunks
        .map((chunk) => {
          if (chunk && typeof chunk === 'object' && 'value' in chunk) {
            const v = chunk.value
            if (Array.isArray(v)) return v.join('')
            return String(v)
          }
          return ''
        })
        .join('')
      return text || null
    }
    return JSON.stringify(raw)
  }
  return String(raw)
}

function extractTableInfo(table: PgTable): TableInfo {
  const config = getTableConfig(table)
  const columns: ColumnInfo[] = config.columns.map((col) => ({
    name: col.name,
    dataType: col.dataType,
    columnType: col.columnType,
    notNull: col.notNull,
    hasDefault: col.hasDefault,
    default: serializeDefault(col.default),
    primary: col.primary,
    isUnique: col.isUnique ?? false,
  }))

  const foreignKeys: ForeignKeyInfo[] = config.foreignKeys.map((fk) => {
    const reference = fk.reference()
    return {
      columns: reference.columns.map((c) => c.name),
      foreignTable: getTableConfig(reference.foreignTable as PgTable).name,
      foreignColumns: reference.foreignColumns.map((c) => c.name),
      onDelete: fk.onDelete ?? null,
      onUpdate: fk.onUpdate ?? null,
    }
  })

  const indexes: IndexInfo[] = config.indexes.map((idx) => {
    const cfg = idx.config
    const cols = (cfg.columns ?? []).map((c: { name?: string } | unknown) => {
      if (c && typeof c === 'object' && 'name' in c && typeof c.name === 'string') return c.name
      return String(c)
    })
    const whereClause = cfg.where ? cfg.where.queryChunks?.map((chunk: unknown) => {
      if (chunk && typeof chunk === 'object' && 'value' in chunk) return String((chunk as { value: unknown }).value)
      return String(chunk)
    }).join('') : null
    return {
      name: cfg.name,
      unique: cfg.unique ?? false,
      columns: cols,
      where: whereClause,
    }
  })

  const primaryKey = columns.filter((c) => c.primary).map((c) => c.name)

  return {
    name: config.name,
    schema: config.schema ?? null,
    columns,
    foreignKeys,
    indexes,
    primaryKey,
  }
}

async function main() {
  const dbmlOut = resolve('dist/schema.dbml')
  const jsonOut = resolve('dist/schema.json')
  mkdirSync(dirname(dbmlOut), { recursive: true })

  pgGenerate({ schema: schemaModule, out: dbmlOut, relational: true })
  console.log(`DBML written to ${dbmlOut}`)

  const tables: TableInfo[] = []
  for (const value of Object.values(schemaModule)) {
    if (value && typeof value === 'object' && is(value, PgTableSymbol)) {
      tables.push(extractTableInfo(value as PgTable))
    }
  }
  tables.sort((a, b) => a.name.localeCompare(b.name))

  const meta = {
    generatedAt: new Date().toISOString(),
    tables,
  }
  writeFileSync(jsonOut, JSON.stringify(meta, null, 2), 'utf-8')
  console.log(`Schema metadata written to ${jsonOut} (${tables.length} tables)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
