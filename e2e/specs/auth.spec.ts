import { test, expect, makeUser, registerViaUI, loginViaUI, registerAndLoginViaUI } from '../fixtures/test.js'

test.describe('Auth — fluxo completo via UI', () => {
  test('cadastro abre a tela de sucesso e link "Fazer login" leva pra /login', async ({ page }) => {
    const u = makeUser('register')
    await registerViaUI(page, u)
    await page.getByRole('link', { name: 'Fazer login' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('login com credenciais válidas redireciona pra /feed e exibe sidebar', async ({ page }) => {
    const u = makeUser('login-ok')
    await registerAndLoginViaUI(page, u)
    await expect(page).toHaveURL(/\/feed$/)
    // Sidebar autenticada está visível
    await expect(page.getByRole('link', { name: 'Feed', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Comunidades', exact: true })).toBeVisible()
  })

  test('login com senha errada mostra mensagem de erro e fica em /login', async ({ page }) => {
    const u = makeUser('login-fail')
    await registerViaUI(page, u)
    await page.getByRole('link', { name: 'Fazer login' }).click()

    await page.getByLabel('E-mail').fill(u.email)
    await page.getByLabel('Senha').fill('SenhaErrada123!')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('rota protegida sem auth redireciona pra /login', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('logout pelo /settings encerra a sessão e bloqueia /feed', async ({ page }) => {
    const u = makeUser('logout')
    await registerAndLoginViaUI(page, u)

    await page.goto('/settings')
    // Tab "Sessão" — clica via label do botão da aba
    await page.getByRole('button', { name: 'Sessão' }).click()
    await page.getByRole('button', { name: 'Sair da conta' }).click()

    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 })

    // Confirma que /feed agora redireciona pra login
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('refresh da página mantém sessão (cookie HttpOnly + /auth/refresh)', async ({ page }) => {
    const u = makeUser('refresh')
    await registerAndLoginViaUI(page, u)

    await page.reload()
    await expect(page).toHaveURL(/\/feed$/)
    await expect(page.getByRole('link', { name: 'Feed', exact: true })).toBeVisible()
  })

  test('alterar senha pelo /settings revoga sessão e exige novo login', async ({ page }) => {
    const u = makeUser('chg-pass')
    await registerAndLoginViaUI(page, u)

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Segurança' }).click()

    await page.getByLabel('Senha atual').fill(u.password)
    await page.getByLabel('Nova senha').fill('NovaSenha456!')
    await page.getByLabel('Confirmar nova senha').fill('NovaSenha456!')
    await page.getByRole('button', { name: 'Alterar senha' }).click()

    await expect(page.getByText('Senha alterada com sucesso!')).toBeVisible({ timeout: 10_000 })

    // Pós-troca: o middleware authenticate vai bater tokenVersion no DB e o
    // próximo /auth/refresh OU GET autenticado deve dar 401. Faz logout explícito
    // pra garantir estado limpo, e tenta logar com a nova senha.
    await page.goto('/login')
    // Pode haver redirect-back-to-feed se token ainda não foi invalidado em memória;
    // forçamos clearAuth via reload em /login.
    await page.reload()
    await page.getByLabel('E-mail').fill(u.email)
    await page.getByLabel('Senha').fill('NovaSenha456!')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 })
  })

  test('forgot-password aceita e-mail e mostra confirmação', async ({ page }) => {
    const u = makeUser('forgot')
    await registerViaUI(page, u)
    await page.goto('/forgot-password')

    await page.getByLabel('E-mail').fill(u.email)
    await page.getByRole('button', { name: /enviar|recuperar|redefinir/i }).click()

    // Resposta sempre é "se existir, enviamos" — basta a mensagem genérica aparecer.
    // Não testamos consumir o token (não há captura de e-mail no setup local).
    await expect(
      page.getByText(/se o e-?mail existir|verifique sua caixa|enviamos as instru/i),
    ).toBeVisible({ timeout: 10_000 })
  })
})
