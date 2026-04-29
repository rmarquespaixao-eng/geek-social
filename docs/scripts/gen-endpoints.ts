import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resetDir, writeFileEnsuringDir, writeStubIfMissing } from './lib/fs-helpers.js'

type OpenApiSpec = {
  paths: Record<string, Record<string, OpenApiOperation>>
  tags?: Array<{ name: string; description?: string }>
}

type OpenApiOperation = {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: JsonSchema }>
  }
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: JsonSchema }> }>
  security?: Array<Record<string, string[]>>
}

type JsonSchema = {
  type?: string
  format?: string
  description?: string
  enum?: unknown[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  $ref?: string
  additionalProperties?: boolean | JsonSchema
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

function tagToFolderName(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function operationIdToFile(operationId: string, tag: string): string {
  // Strip the tag prefix (e.g. auth_login -> login). If no prefix, keep as-is.
  const tagSnake = tag.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (operationId.startsWith(tagSnake + '_')) {
    return operationId.slice(tagSnake.length + 1).replace(/_/g, '-')
  }
  return operationId.replace(/_/g, '-')
}

function fmtSchemaType(schema: JsonSchema | undefined): string {
  if (!schema) return 'unknown'
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (schema.type === 'array' && schema.items) return `Array of ${fmtSchemaType(schema.items)}`
  if (schema.format) return `${schema.type} (${schema.format})`
  return schema.type ?? 'object'
}

function escapeForJsx(text: string): string {
  return text.replace(/[{}]/g, (m) => `{'${m}'}`)
}

function generateMetaTsx(method: string, path: string, op: OpenApiOperation): string {
  const auth = op.security && op.security.length > 0
    ? op.security
        .map((s) => Object.keys(s).join('+'))
        .join(', ')
    : 'público'
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  POST: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  PUT: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  PATCH: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  DELETE: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
}

export default function Meta() {
  return (
    <div className="not-prose flex flex-wrap items-center gap-3 my-6 p-4 rounded-lg border bg-fd-card text-fd-card-foreground">
      <span className={\`px-2.5 py-1 text-xs font-mono font-semibold rounded border \${METHOD_COLOR[${JSON.stringify(method.toUpperCase())}] ?? 'bg-fd-muted'}\`}>
        ${method.toUpperCase()}
      </span>
      <code className="text-sm font-mono">${escapeForJsx(path)}</code>
      <span className="ml-auto text-xs text-fd-muted-foreground">
        Auth: <span className="font-mono">${escapeForJsx(auth)}</span>
      </span>
    </div>
  )
}
`
}

function renderSchemaTable(schema: JsonSchema | undefined, prefix = ''): string {
  if (!schema) return '<em>(sem corpo)</em>'
  if (!schema.properties) {
    return `<code>${fmtSchemaType(schema)}</code>${schema.description ? ` — ${escapeForJsx(schema.description)}` : ''}`
  }
  const required = new Set(schema.required ?? [])
  const rows = Object.entries(schema.properties).map(([name, prop]) => {
    const path = prefix ? `${prefix}.${name}` : name
    const type = fmtSchemaType(prop)
    const req = required.has(name) ? 'sim' : 'não'
    const desc = prop.description ? escapeForJsx(prop.description) : ''
    return `        <tr><td className="font-mono">${path}</td><td className="font-mono text-xs">${type}</td><td>${req}</td><td>${desc}</td></tr>`
  })
  return `<table className="w-full text-sm my-4">
      <thead><tr><th className="text-left">Campo</th><th className="text-left">Tipo</th><th className="text-left">Requerido</th><th className="text-left">Descrição</th></tr></thead>
      <tbody>
${rows.join('\n')}
      </tbody>
    </table>`
}

function generateRequestTsx(op: OpenApiOperation): string {
  const body = op.requestBody?.content?.['application/json']?.schema
  const inner = body
    ? renderSchemaTable(body)
    : '<p>Esta requisição não tem corpo.</p>'
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Request() {
  return (
    <div className="not-prose">
      ${inner}
    </div>
  )
}
`
}

function generateResponsesTsx(op: OpenApiOperation): string {
  const responses = op.responses ?? {}
  const blocks = Object.entries(responses).map(([status, resp]) => {
    const schema = resp.content?.['application/json']?.schema
    const table = schema ? renderSchemaTable(schema) : '<p>Sem corpo na resposta.</p>'
    const desc = resp.description && resp.description !== 'Default Response' ? escapeForJsx(resp.description) : ''
    return `      <section className="mb-6">
        <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <code className="px-1.5 py-0.5 rounded bg-fd-muted text-xs font-mono">${status}</code>
          ${desc ? `<span className="text-fd-muted-foreground">${desc}</span>` : ''}
        </h4>
        ${table}
      </section>`
  })
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Responses() {
  return (
    <div className="not-prose">
${blocks.join('\n')}
    </div>
  )
}
`
}

function generateErrorsTsx(op: OpenApiOperation): string {
  const responses = op.responses ?? {}
  const errorEntries = Object.entries(responses).filter(([s]) => /^[45]\d\d$/.test(s))
  if (errorEntries.length === 0) {
    return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Errors() {
  return <p className="not-prose text-fd-muted-foreground">Sem respostas de erro documentadas.</p>
}
`
  }
  const rows = errorEntries.map(([status, resp]) => {
    const schema = resp.content?.['application/json']?.schema
    const desc = schema?.properties?.error?.description ?? ''
    return `        <tr><td className="font-mono">${status}</td><td className="font-mono">${desc ? escapeForJsx(desc.split('.')[0]) : '—'}</td></tr>`
  })
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
export default function Errors() {
  return (
    <div className="not-prose">
      <table className="w-full text-sm my-4">
        <thead><tr><th className="text-left">Status</th><th className="text-left">Códigos possíveis (extraídos do schema)</th></tr></thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
    </div>
  )
}
`
}

function generateExamplesTsx(method: string, path: string): string {
  const baseUrl = 'http://localhost:3003'
  return `// AUTO-GENERATED — do not edit. Run npm run gen to regenerate.
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

const CURL = \`curl -X ${method.toUpperCase()} '${baseUrl}${path}' \\\\
  -H 'Content-Type: application/json' \\\\
  -H 'Authorization: Bearer SEU_ACCESS_TOKEN' \\\\
  -d '{}'\`

const NODE = \`await fetch('${baseUrl}${path}', {
  method: '${method.toUpperCase()}',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + accessToken,
  },
  body: JSON.stringify({}),
})\`

export default function Examples() {
  return (
    <Tabs items={['cURL', 'Node fetch']}>
      <Tab value="cURL">
        <pre className="text-xs"><code>{CURL}</code></pre>
      </Tab>
      <Tab value="Node fetch">
        <pre className="text-xs"><code>{NODE}</code></pre>
      </Tab>
    </Tabs>
  )
}
`
}

function generateStubMdx(method: string, path: string, op: OpenApiOperation, tagFolder: string, fileSlug: string): string {
  const summary = (op.summary ?? `${method.toUpperCase()} ${path}`).replace(/"/g, "'")
  return `---
title: ${method.toUpperCase()} ${path}
description: ${summary}
---

import Meta from '@/generated/api/${tagFolder}/${fileSlug}/meta'
import Request from '@/generated/api/${tagFolder}/${fileSlug}/request'
import Responses from '@/generated/api/${tagFolder}/${fileSlug}/responses'
import Errors from '@/generated/api/${tagFolder}/${fileSlug}/errors'
import Examples from '@/generated/api/${tagFolder}/${fileSlug}/examples'

<Meta />

${op.description ?? 'TODO: descrição em prose — pra que serve, quando chamar, side effects.'}

## Request

<Request />

## Response

<Responses />

## Erros

<Errors />

{/* TODO: para cada código de erro acima, explique a causa e como resolver. */}

## Exemplos

<Examples />

## Side effects

{/* TODO: eventos de socket emitidos, notificações disparadas, jobs enfileirados, cascades. */}

## Relacionados

{/* TODO: links pra módulo, conceitos, endpoints relacionados. */}

> 💡 Quer testar este endpoint interativamente? Use o [Sandbox de API](/docs/api/playground) com sua chave de auth.
`
}

async function main() {
  const openapiPath = resolve('public/openapi.json')
  const spec: OpenApiSpec = JSON.parse(readFileSync(openapiPath, 'utf-8'))

  const generatedRoot = resolve('src/generated/api')
  const contentRoot = resolve('content/docs/api')

  resetDir(generatedRoot)

  let endpointCount = 0
  let stubsCreated = 0

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method] as OpenApiOperation | undefined
      if (!op) continue

      // Só gera para endpoints com tags declaradas (i.e., schema: completo no backend)
      const tag = op.tags?.[0]
      if (!tag) continue

      const tagFolder = tagToFolderName(tag)
      const operationId = op.operationId ?? `${method}_${path.replace(/[^a-z0-9]+/gi, '_')}`
      const fileSlug = operationIdToFile(operationId, tagFolder)

      const partialDir = resolve(generatedRoot, tagFolder, fileSlug)
      writeFileEnsuringDir(resolve(partialDir, 'meta.tsx'), generateMetaTsx(method, path, op))
      writeFileEnsuringDir(resolve(partialDir, 'request.tsx'), generateRequestTsx(op))
      writeFileEnsuringDir(resolve(partialDir, 'responses.tsx'), generateResponsesTsx(op))
      writeFileEnsuringDir(resolve(partialDir, 'errors.tsx'), generateErrorsTsx(op))
      writeFileEnsuringDir(resolve(partialDir, 'examples.tsx'), generateExamplesTsx(method, path))

      const stubPath = resolve(contentRoot, tagFolder, `${fileSlug}.mdx`)
      if (writeStubIfMissing(stubPath, generateStubMdx(method, path, op, tagFolder, fileSlug))) {
        stubsCreated++
      }
      endpointCount++
    }
  }

  console.log(`✓ ${endpointCount} endpoints processados`)
  console.log(`✓ ${stubsCreated} stubs MDX criados (existentes preservados)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
