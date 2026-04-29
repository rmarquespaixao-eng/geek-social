import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resetDir, writeFileEnsuringDir, writeStubIfMissing } from './lib/fs-helpers.js'

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

type SchemaJson = {
  generatedAt: string
  tables: TableInfo[]
}

function escape(s: unknown): string {
  return String(s ?? '').replace(/[{}]/g, (m) => `{'${m}'}`)
}

function shortType(col: ColumnInfo): string {
  return col.columnType.replace(/^Pg/, '').toLowerCase()
}

function generateColumnsTsx(table: TableInfo): string {
  const rows = table.columns.map((c) => {
    return `        <tr>
          <td className="font-mono text-sm">${escape(c.name)}${c.primary ? ' <span title="primary key" className="text-amber-500">●</span>' : ''}${c.isUnique ? ' <span title="unique" className="text-sky-500">◆</span>' : ''}</td>
          <td className="font-mono text-xs">${escape(shortType(c))}</td>
          <td>${c.notNull ? 'NOT NULL' : 'NULL ok'}</td>
          <td className="font-mono text-xs">${escape(c.default ?? '—')}</td>
        </tr>`
  })
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Columns() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Coluna</th><th className="text-left">Tipo</th><th className="text-left">Nullable</th><th className="text-left">Default</th></tr></thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
      <p className="text-xs text-fd-muted-foreground"><span className="text-amber-500">●</span> primary key &nbsp; <span className="text-sky-500">◆</span> unique</p>
    </div>
  )
}
`
}

function generateFksTsx(table: TableInfo): string {
  if (table.foreignKeys.length === 0) {
    return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Fks() {
  return <p className="not-prose text-fd-muted-foreground">Esta tabela não tem foreign keys.</p>
}
`
  }
  const rows = table.foreignKeys.map((fk) => {
    return `        <tr>
          <td className="font-mono">${escape(fk.columns.join(', '))}</td>
          <td className="font-mono">${escape(fk.foreignTable)}.${escape(fk.foreignColumns.join(', '))}</td>
          <td>${escape(fk.onDelete ?? '—')}</td>
          <td>${escape(fk.onUpdate ?? '—')}</td>
        </tr>`
  })
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Fks() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Coluna(s)</th><th className="text-left">Referência</th><th className="text-left">ON DELETE</th><th className="text-left">ON UPDATE</th></tr></thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
    </div>
  )
}
`
}

function generateIndexesTsx(table: TableInfo): string {
  if (table.indexes.length === 0) {
    return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Indexes() {
  return <p className="not-prose text-fd-muted-foreground">Esta tabela não tem índices customizados.</p>
}
`
  }
  const rows = table.indexes.map((idx) => {
    return `        <tr>
          <td className="font-mono text-sm">${escape(idx.name)}</td>
          <td>${idx.unique ? 'sim' : 'não'}</td>
          <td className="font-mono">${escape(idx.columns.join(', '))}</td>
          <td className="font-mono text-xs">${escape(idx.where ?? '—')}</td>
        </tr>`
  })
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Indexes() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Nome</th><th className="text-left">Único</th><th className="text-left">Colunas</th><th className="text-left">WHERE (parcial)</th></tr></thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
    </div>
  )
}
`
}

function generateConstraintsTsx(table: TableInfo): string {
  const items: string[] = []
  if (table.primaryKey.length > 0) {
    items.push(`PRIMARY KEY (${table.primaryKey.join(', ')})`)
  }
  for (const c of table.columns) {
    if (c.isUnique) items.push(`UNIQUE (${c.name})`)
  }
  if (items.length === 0) {
    return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Constraints() {
  return <p className="not-prose text-fd-muted-foreground">Sem constraints declaradas além das colunas.</p>
}
`
  }
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Constraints() {
  return (
    <div className="not-prose">
      <ul className="list-disc pl-6 my-3 text-sm">
${items.map((i) => `        <li><code>${escape(i)}</code></li>`).join('\n')}
      </ul>
    </div>
  )
}
`
}

function generateStubMdx(table: TableInfo): string {
  return `---
title: ${table.name}
description: Tabela ${table.name} — TODO descrição.
---

import Columns from '@/generated/data-model/tables/${table.name}/columns'
import Fks from '@/generated/data-model/tables/${table.name}/fks'
import Indexes from '@/generated/data-model/tables/${table.name}/indexes'
import Constraints from '@/generated/data-model/tables/${table.name}/constraints'

{/* TODO: 1 parágrafo sobre o propósito desta tabela no domínio. */}

## Colunas

<Columns />

## Funcionalidade dos campos

{/* TODO: explicar campo a campo o que cada coluna representa, regras especiais. */}

## Foreign keys

<Fks />

## Índices

<Indexes />

{/* TODO: rationale dos índices parciais (qual query otimizam). */}

## Constraints

<Constraints />

## Tabelas relacionadas

{/* TODO: links pras tabelas que se relacionam com esta. */}
`
}

async function main() {
  const schemaPath = resolve('public/schema.json')
  const data: SchemaJson = JSON.parse(readFileSync(schemaPath, 'utf-8'))

  const generatedRoot = resolve('src/generated/data-model/tables')
  const contentRoot = resolve('content/docs/data-model/tables')

  resetDir(generatedRoot)

  let stubsCreated = 0
  for (const table of data.tables) {
    const partialDir = resolve(generatedRoot, table.name)
    writeFileEnsuringDir(resolve(partialDir, 'columns.tsx'), generateColumnsTsx(table))
    writeFileEnsuringDir(resolve(partialDir, 'fks.tsx'), generateFksTsx(table))
    writeFileEnsuringDir(resolve(partialDir, 'indexes.tsx'), generateIndexesTsx(table))
    writeFileEnsuringDir(resolve(partialDir, 'constraints.tsx'), generateConstraintsTsx(table))

    const stubPath = resolve(contentRoot, `${table.name}.mdx`)
    if (writeStubIfMissing(stubPath, generateStubMdx(table))) {
      stubsCreated++
    }
  }

  console.log(`✓ ${data.tables.length} tabelas processadas`)
  console.log(`✓ ${stubsCreated} stubs MDX criados (existentes preservados)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
