import { test, expect, makeUser, registerAndLoginViaUI } from '../fixtures/test.js'

test.describe('Friends + Chat — fluxo de 2 usuários', () => {
  test('A envia pedido → B aceita → ambos viram amigos', async ({ browser }) => {
    const userA = makeUser('frA')
    const userB = makeUser('frB')

    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    // Setup: A e B se cadastram
    await registerAndLoginViaUI(pageA, userA)
    await registerAndLoginViaUI(pageB, userB)

    // A busca por B na aba Buscar e abre o perfil dele
    await pageA.getByRole('link', { name: 'Amigos', exact: true }).click()
    await expect(pageA).toHaveURL(/\/friends/)
    await pageA.getByRole('button', { name: /Buscar/ }).click()
    await pageA.getByPlaceholder('Buscar por nome...').fill(userB.displayName)
    // Espera o resultado renderizar (debounce 350ms + request)
    await pageA.getByText(userB.displayName).first().click({ timeout: 10_000 })
    await expect(pageA).toHaveURL(/\/profile\//)

    // A clica "Adicionar amigo"
    await pageA.getByRole('button', { name: /Adicionar amigo/ }).click()
    await expect(pageA.getByRole('button', { name: /Pedido enviado/ })).toBeVisible({ timeout: 10_000 })

    // B abre Amigos → Pedidos e aceita
    await pageB.getByRole('link', { name: 'Amigos', exact: true }).click()
    await pageB.getByRole('button', { name: /Pedidos/ }).click()
    await expect(pageB.getByText(userA.displayName)).toBeVisible({ timeout: 10_000 })
    await pageB.getByRole('button', { name: /Aceitar/ }).first().click()

    // Confirma amizade do lado de B (vai pra aba Amigos, deve ver A)
    await pageB.getByRole('button', { name: /^Amigos/ }).click()
    await expect(pageB.getByText(userA.displayName)).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })

  test('após amizade, A inicia DM e B recebe mensagem em tempo real', async ({ browser }) => {
    const userA = makeUser('chA')
    const userB = makeUser('chB')

    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    await registerAndLoginViaUI(pageA, userA)
    await registerAndLoginViaUI(pageB, userB)

    // ── A envia pedido pra B ─────────────────────────────────────────────
    await pageA.getByRole('link', { name: 'Amigos', exact: true }).click()
    await pageA.getByRole('button', { name: /Buscar/ }).click()
    await pageA.getByPlaceholder('Buscar por nome...').fill(userB.displayName)
    await pageA.getByText(userB.displayName).first().click({ timeout: 10_000 })
    await pageA.getByRole('button', { name: /Adicionar amigo/ }).click()
    await expect(pageA.getByRole('button', { name: /Pedido enviado/ })).toBeVisible({ timeout: 10_000 })

    // ── B aceita ─────────────────────────────────────────────────────────
    await pageB.getByRole('link', { name: 'Amigos', exact: true }).click()
    await pageB.getByRole('button', { name: /Pedidos/ }).click()
    await pageB.getByRole('button', { name: /Aceitar/ }).first().click()
    // Aguarda hidratação do friends store
    await expect(pageB.getByText(userA.displayName)).toBeVisible({ timeout: 10_000 })

    // ── A vai pro perfil de B e abre conversa (ou via /chat) ─────────────
    // Caminho mais robusto: B abre o chat e A também — quando uma mensagem
    // for enviada, ambos têm a sala carregada via WS.
    await pageA.getByRole('link', { name: 'Chat', exact: true }).click()
    await pageB.getByRole('link', { name: 'Chat', exact: true }).click()
    await expect(pageA).toHaveURL(/\/chat/)

    // A clica no item da lista referente a B
    // A primeira conversa visível com o displayName de B
    const convOfBInA = pageA.getByText(userB.displayName).first()
    await convOfBInA.click({ timeout: 10_000 })

    // A digita e envia (Enter)
    const composerA = pageA.getByPlaceholder('Digite uma mensagem…')
    const messageText = `Olá ${userB.displayName.split(' ').pop()} via E2E ${Date.now()}`
    await composerA.fill(messageText)
    await composerA.press('Enter')

    // A vê própria mensagem renderizada
    await expect(pageA.getByText(messageText)).toBeVisible({ timeout: 10_000 })

    // B abre a conversa de A (item recém-chegado via WS) e vê a mensagem
    await pageB.getByText(userA.displayName).first().click({ timeout: 15_000 })
    await expect(pageB.getByText(messageText)).toBeVisible({ timeout: 15_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
