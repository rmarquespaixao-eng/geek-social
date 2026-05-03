// Fixtures de teste — TUDO via UI. Não há atalho via API: o intuito é validar
// que a interface inteira funciona ponta-a-ponta. Helpers abaixo apenas encapsulam
// sequências repetitivas de cliques/preenchimentos pra specs ficarem legíveis.

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test'

export type TestUser = {
  email: string
  password: string
  displayName: string
}

export function makeUser(prefix: string): TestUser {
  const ts = Date.now()
  const rnd = Math.random().toString(36).slice(2, 8)
  return {
    email: `${prefix}-${ts}-${rnd}@e2e.local`,
    password: 'Senha123!Teste',
    displayName: `E2E ${prefix} ${rnd}`,
  }
}

// ─── Auth helpers (via UI) ───────────────────────────────────────────────
export async function registerViaUI(page: Page, u: TestUser): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Nome de exibição').fill(u.displayName)
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha', { exact: true }).fill(u.password)
  await page.getByLabel('Confirmar senha').fill(u.password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  // Sucesso: tela com "Conta criada com sucesso!"
  await expect(page.getByText('Conta criada com sucesso!')).toBeVisible({ timeout: 15_000 })
}

export async function loginViaUI(page: Page, u: TestUser): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(u.email)
  await page.getByLabel('Senha').fill(u.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/feed', { timeout: 15_000 })
}

export async function registerAndLoginViaUI(page: Page, u: TestUser): Promise<void> {
  await registerViaUI(page, u)
  // Após registro, RegisterView limpa o auth e mostra link "Fazer login".
  await page.getByRole('link', { name: 'Fazer login' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await loginViaUI(page, u)
}

// ─── Sidebar nav helpers ─────────────────────────────────────────────────
export async function navTo(page: Page, label: string): Promise<void> {
  await page.getByRole('link', { name: label, exact: true }).click()
}

// ─── Multi-context (pra friends-chat) ────────────────────────────────────
export async function newAuthedContext(
  context: BrowserContext,
  u: TestUser,
): Promise<Page> {
  const page = await context.newPage()
  await registerAndLoginViaUI(page, u)
  return page
}

type Fixtures = {
  user: TestUser
}

export const test = base.extend<Fixtures>({
  user: async ({}, use) => {
    await use(makeUser('main'))
  },
})

export { expect }
