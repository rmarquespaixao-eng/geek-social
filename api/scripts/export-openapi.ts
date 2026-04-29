import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildApp } from '../src/app.js'

async function main() {
  const app = await buildApp()
  await app.ready()

  const spec = app.swagger()
  const outPath = resolve('dist/openapi.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(spec, null, 2), 'utf-8')

  console.log(`OpenAPI spec written to ${outPath}`)
  console.log(`  paths: ${Object.keys(spec.paths ?? {}).length}`)
  console.log(`  tags: ${(spec.tags ?? []).map(t => t.name).join(', ')}`)

  await app.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
