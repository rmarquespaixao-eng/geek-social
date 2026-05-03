import { test, expect, makeUser, registerAndLoginViaUI } from '../fixtures/test.js'

test.describe('Feed', () => {
  test('feed vazio mostra mensagem padrão pra novo usuário', async ({ page }) => {
    const u = makeUser('feed-empty')
    await registerAndLoginViaUI(page, u)

    // /feed é a tela de aterrissagem após login
    await expect(page).toHaveURL(/\/feed$/)
    await expect(page.getByText('Seu feed está vazio')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/adicione amigos/i)).toBeVisible()
  })

  test('sidebar mostra widgets de "Amigos online" e "Coleções"', async ({ page }) => {
    const u = makeUser('feed-side')
    await registerAndLoginViaUI(page, u)

    await expect(page.getByText(/AMIGOS ONLINE/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/COLEÇÕES/i)).toBeVisible()
  })

  test('console do browser não acumula erros JS no carregamento do feed', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const u = makeUser('feed-console')
    await registerAndLoginViaUI(page, u)
    await page.waitForTimeout(2000) // deixa o initializeAuth + WS conectar

    // Filtra ruído conhecido (ex: avisos de imagem 404 que o backend devolve em dev).
    const real = errors.filter(
      (e) => !e.includes('Failed to load resource') && !e.includes('favicon'),
    )
    expect(real, `Erros JS detectados:\n${real.join('\n')}`).toEqual([])
  })
})
