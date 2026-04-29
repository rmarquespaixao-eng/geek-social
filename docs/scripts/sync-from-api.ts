import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const API_DIST = resolve('../geek-social-api/dist')
const DOCS_PUBLIC = resolve('public')

const FILES = [
  { src: 'openapi.json', dst: 'openapi.json' },
  { src: 'schema.dbml', dst: 'schema.dbml' },
  { src: 'schema.json', dst: 'schema.json' },
]

function copyOrFail() {
  if (!existsSync(API_DIST)) {
    console.error(`Diretório do backend não encontrado: ${API_DIST}`)
    console.error('Rode `npm run export:all` em geek-social-api primeiro.')
    process.exit(1)
  }

  for (const { src, dst } of FILES) {
    const srcPath = resolve(API_DIST, src)
    const dstPath = resolve(DOCS_PUBLIC, dst)
    if (!existsSync(srcPath)) {
      console.error(`Artifact ausente: ${srcPath}`)
      console.error('Rode `npm run export:all` em geek-social-api primeiro.')
      process.exit(1)
    }
    mkdirSync(dirname(dstPath), { recursive: true })
    copyFileSync(srcPath, dstPath)
    console.log(`✓ ${src} → ${dstPath}`)
  }
}

copyOrFail()
