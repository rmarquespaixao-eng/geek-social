import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function writeFileEnsuringDir(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf-8')
}

export function writeStubIfMissing(path: string, content: string): boolean {
  if (existsSync(path)) return false
  writeFileEnsuringDir(path, content)
  return true
}

export function resetDir(path: string) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  mkdirSync(path, { recursive: true })
}
