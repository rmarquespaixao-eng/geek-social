import { test, expect, makeUser, registerAndLoginViaUI } from '../fixtures/test.js'
import { tinyPng } from '../fixtures/files.js'

test.describe('Communities — descobrir, criar, abrir', () => {
  test('navega de Feed → Comunidades pela sidebar e renderiza o discover', async ({ page }) => {
    const u = makeUser('comm-nav')
    await registerAndLoginViaUI(page, u)

    await page.getByRole('link', { name: 'Comunidades', exact: true }).click()
    await expect(page).toHaveURL(/\/comunidades/)
    await expect(page.getByTestId('community-discover-view')).toBeVisible()
    await expect(page.getByPlaceholder('Buscar comunidades...')).toBeVisible()
  })

  test('cria uma comunidade pública via formulário e cai no detalhe dela', async ({ page }) => {
    const u = makeUser('comm-create')
    await registerAndLoginViaUI(page, u)

    await page.goto('/comunidades/nova')
    await expect(page.getByTestId('community-create-view')).toBeVisible()
    await expect(page.getByTestId('community-form')).toBeVisible()

    // Inputs de arquivo são hidden — Playwright manda setInputFiles direto neles.
    const fileInputs = page.locator('input[type="file"]')
    await fileInputs.nth(0).setInputFiles(tinyPng('cover.png'))   // cover (5MB max)
    await fileInputs.nth(1).setInputFiles(tinyPng('icon.png'))    // icon  (2MB max)

    const uniqueName = `Comm E2E ${Date.now().toString(36)}`
    await page.getByTestId('community-name').fill(uniqueName)
    await page.getByTestId('community-description').fill('Comunidade gerada por teste E2E.')
    await page.getByTestId('community-category').selectOption('boardgames')
    // Visibility default já é 'public' — não precisa mexer.

    await page.getByTestId('community-form-submit').click()

    // Aguarda redirect pra detalhe (slug derivado do nome) ou listagem com a comunidade visível.
    await expect(page).toHaveURL(/\/comunidades\/[^/]+/, { timeout: 20_000 })
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })
  })

  test('discover lista a comunidade pública criada', async ({ page }) => {
    const u = makeUser('comm-list')
    await registerAndLoginViaUI(page, u)

    // Cria via UI (não via API)
    await page.goto('/comunidades/nova')
    const fileInputs = page.locator('input[type="file"]')
    await fileInputs.nth(0).setInputFiles(tinyPng('cover.png'))
    await fileInputs.nth(1).setInputFiles(tinyPng('icon.png'))
    const uniqueName = `Discover ${Date.now().toString(36)}`
    await page.getByTestId('community-name').fill(uniqueName)
    await page.getByTestId('community-description').fill('Listagem E2E.')
    await page.getByTestId('community-category').selectOption('rpg-mesa')
    await page.getByTestId('community-form-submit').click()
    await expect(page).toHaveURL(/\/comunidades\/[^/]+/, { timeout: 20_000 })

    // Volta pro discover e procura a comunidade na busca
    await page.getByRole('link', { name: 'Comunidades', exact: true }).click()
    await page.getByPlaceholder('Buscar comunidades...').fill(uniqueName)
    await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 10_000 })
  })
})
