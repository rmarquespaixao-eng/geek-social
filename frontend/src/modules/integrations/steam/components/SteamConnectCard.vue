<template>
  <div class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated) mb-6">
    <div class="flex items-start justify-between gap-3 mb-2">
      <h2 class="text-base font-semibold text-(--color-text-primary)">Contas conectadas</h2>
      <button
        type="button"
        class="flex items-center gap-1 text-xs text-(--color-text-muted) hover:text-(--color-accent-amber) transition-colors"
        @click="showHelp = !showHelp"
      >
        <HelpCircle :size="14" />
        <span>{{ showHelp ? 'Ocultar ajuda' : 'Como configurar?' }}</span>
      </button>
    </div>
    <p class="text-sm text-(--color-text-muted) mb-4">Vincule sua conta Steam para importar sua biblioteca de jogos.</p>

    <!-- Painel de ajuda -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div v-if="showHelp" class="mb-5 rounded-xl border border-(--color-accent-amber)/30 bg-(--color-accent-amber)/5 p-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-(--color-text-primary) mb-3">
          <Info :size="14" class="text-(--color-accent-amber)" />
          Passo a passo
        </h3>

        <ol class="space-y-3 text-sm text-(--color-text-secondary)">
          <li class="flex gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-(--color-accent-amber)/20 text-(--color-accent-amber) text-xs font-bold flex items-center justify-center">1</span>
            <div>
              <strong class="text-(--color-text-primary)">Conectar a conta Steam.</strong>
              <p class="text-xs text-(--color-text-muted) mt-1">
                Clique em <em>Conectar Steam</em>. Você será redirecionado para o site oficial da Steam,
                vai logar com seu usuário e autorizar a vinculação. Apenas seu SteamID é guardado — sua senha nunca passa por aqui.
              </p>
            </div>
          </li>

          <li class="flex gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-(--color-accent-amber)/20 text-(--color-accent-amber) text-xs font-bold flex items-center justify-center">2</span>
            <div>
              <strong class="text-(--color-text-primary)">Gerar a Web API Key da Steam.</strong>
              <p class="text-xs text-(--color-text-muted) mt-1">
                Acesse
                <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener" class="text-(--color-accent-amber) hover:underline inline-flex items-center gap-0.5">
                  steamcommunity.com/dev/apikey
                  <ExternalLink :size="11" />
                </a>
                logado na sua conta Steam. No campo <em>Domain Name</em> coloque qualquer coisa
                (ex: <code class="px-1 py-0.5 rounded bg-(--color-bg-elevated) text-xs font-mono">localhost</code>),
                aceite os termos e clique em <em>Register</em>. A key tem 32 caracteres hexadecimais — copie inteira.
              </p>
              <p class="text-xs text-(--color-text-muted) mt-1.5 italic">
                ⚠ Requisito da Steam: ter uma conta sem limites e ter gasto pelo menos US$5 na loja.
              </p>
            </div>
          </li>

          <li class="flex gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-(--color-accent-amber)/20 text-(--color-accent-amber) text-xs font-bold flex items-center justify-center">3</span>
            <div>
              <strong class="text-(--color-text-primary)">Colar a key aqui.</strong>
              <p class="text-xs text-(--color-text-muted) mt-1">
                Cole no campo <em>Steam Web API Key</em> abaixo (que aparece após conectar) e clique em <em>Salvar</em>.
                A key fica armazenada apenas no seu perfil — outros usuários não têm acesso.
              </p>
            </div>
          </li>

          <li class="flex gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-(--color-accent-amber)/20 text-(--color-accent-amber) text-xs font-bold flex items-center justify-center">4</span>
            <div>
              <strong class="text-(--color-text-primary)">Liberar a privacidade do perfil Steam.</strong>
              <p class="text-xs text-(--color-text-muted) mt-1">
                Sua biblioteca precisa estar visível pra Steam devolver os dados. Vá em
                <em>Steam → seu perfil → Editar perfil → Privacidade</em>, e em
                <em>Detalhes do jogo</em> selecione <em>Público</em>.
              </p>
            </div>
          </li>

          <li class="flex gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-(--color-status-online)/20 text-(--color-status-online) text-xs font-bold flex items-center justify-center">✓</span>
            <div>
              <strong class="text-(--color-text-primary)">Importar.</strong>
              <p class="text-xs text-(--color-text-muted) mt-1">
                Clique em <em>Importar jogos</em>, escolha o destino (nova coleção ou existente), selecione
                quais jogos importar e pronto. Os jogos vão aparecer aos poucos na sua coleção
                enquanto a importação roda em segundo plano.
              </p>
            </div>
          </li>
        </ol>

        <div class="mt-4 pt-3 border-t border-(--color-accent-amber)/20 text-xs text-(--color-text-muted)">
          <strong class="text-(--color-text-secondary)">Posso desconectar depois?</strong>
          Sim. Os jogos importados continuam na sua coleção mesmo após desconectar — você pode editar,
          renomear ou excluir cada item normalmente.
        </div>
      </div>
    </Transition>

    <div class="flex items-start gap-4">
      <div class="w-12 h-12 rounded-xl bg-(--color-bg-elevated) flex items-center justify-center text-(--color-text-secondary) shrink-0">
        <Gamepad2 :size="22" />
      </div>

      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-(--color-text-primary)">Steam</p>
        <template v-if="!steam.isLinked">
          <p class="text-xs text-(--color-text-muted) mt-0.5">Não conectada</p>
          <AppButton variant="primary" class="mt-3 text-xs px-3 py-1.5" :loading="connecting" @click="connect">
            Conectar Steam
          </AppButton>
          <p v-if="connectError" class="text-xs text-(--color-danger) mt-2">{{ connectError }}</p>
        </template>
        <template v-else>
          <p class="text-xs text-(--color-text-muted) mt-0.5 truncate">
            Conectada como SteamID <span class="font-mono text-(--color-text-secondary)">{{ steam.steamId }}</span>
          </p>
          <p v-if="steam.linkedAt" class="text-xs text-(--color-text-muted) mt-0.5">
            Vinculada em {{ formatDate(steam.linkedAt) }}
          </p>

          <!-- Web API Key -->
          <div class="mt-4 p-3 rounded-lg bg-(--color-bg-elevated)/50 border border-(--color-bg-elevated)">
            <div class="flex items-center gap-2 mb-2">
              <KeyRound :size="14" class="text-(--color-text-muted)" />
              <p class="text-xs font-medium text-(--color-text-primary)">Steam Web API Key</p>
              <span v-if="steam.hasApiKey" class="text-[10px] px-2 py-0.5 rounded bg-(--color-status-online)/20 text-(--color-status-online) font-medium">CONFIGURADA</span>
              <span v-else class="text-[10px] px-2 py-0.5 rounded bg-(--color-danger)/20 text-(--color-danger) font-medium">PENDENTE</span>
            </div>
            <p class="text-xs text-(--color-text-muted) mb-2">
              Necessária para listar e importar seus jogos. Gere a sua em
              <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener" class="text-(--color-accent-amber) hover:underline">steamcommunity.com/dev/apikey</a>.
            </p>
            <div v-if="!editingKey && !steam.hasApiKey || editingKey" class="flex items-center gap-2">
              <input
                v-model="apiKeyInput"
                :type="showKey ? 'text' : 'password'"
                placeholder="32 caracteres hexadecimais"
                maxlength="32"
                class="flex-1 px-2 py-1.5 rounded bg-(--color-bg-elevated) text-xs text-(--color-text-primary) font-mono focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30"
                @keydown.enter="saveKey"
              />
              <button
                type="button"
                class="text-(--color-text-muted) hover:text-(--color-text-primary)"
                :title="showKey ? 'Esconder' : 'Mostrar'"
                @click="showKey = !showKey"
              >
                <EyeOff v-if="showKey" :size="16" />
                <Eye v-else :size="16" />
              </button>
              <AppButton variant="primary" class="text-xs px-3 py-1.5" :loading="savingKey" :disabled="apiKeyInput.length !== 32" @click="saveKey">
                Salvar
              </AppButton>
              <AppButton v-if="editingKey" variant="secondary" class="text-xs px-3 py-1.5" @click="cancelEdit">
                Cancelar
              </AppButton>
            </div>
            <div v-else class="flex items-center gap-2">
              <AppButton variant="secondary" class="text-xs px-3 py-1.5" @click="startEditKey">
                Trocar key
              </AppButton>
              <AppButton variant="danger" class="text-xs px-3 py-1.5" @click="askClearKey">
                Remover
              </AppButton>
            </div>
            <p v-if="keyError" class="text-xs text-(--color-danger) mt-2">{{ keyError }}</p>
          </div>

          <div class="flex items-center gap-2 mt-3">
            <AppButton variant="primary" class="text-xs px-3 py-1.5" :disabled="!steam.hasApiKey" @click="goImport">
              Importar jogos
            </AppButton>
            <AppButton variant="danger" class="text-xs px-3 py-1.5" @click="askUnlink">
              Desconectar
            </AppButton>
          </div>
          <p v-if="!steam.hasApiKey" class="text-xs text-(--color-text-muted) mt-2">
            Configure a Web API key acima para habilitar a importação.
          </p>
        </template>
        <p v-if="banner" class="text-xs mt-3 px-3 py-2 rounded-lg" :class="bannerClass">
          {{ banner }}
        </p>
      </div>
    </div>

    <AppConfirmDialog
      :open="showUnlinkConfirm"
      title="Desconectar Steam?"
      description="Os jogos já importados continuarão na sua coleção. A Web API key também será removida."
      confirm-label="Desconectar"
      :loading="unlinking"
      @cancel="showUnlinkConfirm = false"
      @confirm="confirmUnlink"
    />

    <AppConfirmDialog
      :open="showClearKeyConfirm"
      title="Remover Web API key?"
      description="Você não poderá listar nem importar jogos até configurar uma key novamente."
      confirm-label="Remover"
      :loading="clearingKey"
      @cancel="showClearKeyConfirm = false"
      @confirm="confirmClearKey"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Gamepad2, KeyRound, Eye, EyeOff, HelpCircle, Info, ExternalLink } from 'lucide-vue-next'
import { useSteam } from '../composables/useSteam'
import AppButton from '@/shared/ui/AppButton.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'

const steam = useSteam()
const route = useRoute()
const router = useRouter()

const showUnlinkConfirm = ref(false)
const unlinking = ref(false)
const banner = ref<string | null>(null)
const bannerClass = ref('text-(--color-status-online) bg-(--color-status-online)/10')

const apiKeyInput = ref('')
const editingKey = ref(false)
const showKey = ref(false)
const savingKey = ref(false)
const keyError = ref<string | null>(null)
const showClearKeyConfirm = ref(false)
const clearingKey = ref(false)
const showHelp = ref(false)

import * as steamService from '../services/steamService'

const connecting = ref(false)
const connectError = ref<string | null>(null)

async function connect() {
  connecting.value = true
  connectError.value = null
  try {
    const { url } = await steamService.startLogin()
    window.location.href = url
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } } }
    connectError.value = e.response?.data?.error ?? 'Falha ao iniciar conexão com a Steam.'
    connecting.value = false
  }
}

function askUnlink() {
  showUnlinkConfirm.value = true
}

async function confirmUnlink() {
  unlinking.value = true
  try {
    await steam.unlink()
    // Limpa também a key (server side a key fica até o user trocar/clear, mas pra UX faz sentido limpar junto)
    if (steam.hasApiKey) {
      try { await steam.clearApiKey() } catch { /* ignora */ }
    }
    showUnlinkConfirm.value = false
    setBanner('Steam desconectada.', true)
  } finally {
    unlinking.value = false
  }
}

function startEditKey() {
  apiKeyInput.value = ''
  editingKey.value = true
  keyError.value = null
}

function cancelEdit() {
  editingKey.value = false
  apiKeyInput.value = ''
  keyError.value = null
}

async function saveKey() {
  const key = apiKeyInput.value.trim()
  if (!/^[0-9a-fA-F]{32}$/.test(key)) {
    keyError.value = 'A key deve ter exatamente 32 caracteres hexadecimais (0-9, a-f).'
    return
  }
  savingKey.value = true
  keyError.value = null
  try {
    await steam.setApiKey(key)
    apiKeyInput.value = ''
    editingKey.value = false
    showKey.value = false
    setBanner('Web API key salva com sucesso!', true)
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e.response?.data?.error
    if (code === 'STEAM_API_KEY_INVALID_FORMAT') {
      keyError.value = 'Formato inválido — use 32 caracteres hexadecimais.'
    } else {
      keyError.value = 'Erro ao salvar key. Tente novamente.'
    }
  } finally {
    savingKey.value = false
  }
}

function askClearKey() {
  showClearKeyConfirm.value = true
}

async function confirmClearKey() {
  clearingKey.value = true
  try {
    await steam.clearApiKey()
    showClearKeyConfirm.value = false
    setBanner('Web API key removida.', true)
  } finally {
    clearingKey.value = false
  }
}

function goImport() {
  router.push('/integrations/steam/import')
}

import { formatNumericDate as formatDate } from '@/shared/utils/timeAgo'

function setBanner(msg: string, ok: boolean) {
  banner.value = msg
  bannerClass.value = ok
    ? 'text-(--color-status-online) bg-(--color-status-online)/10'
    : 'text-(--color-danger) bg-(--color-danger)/10'
  setTimeout(() => { banner.value = null }, 6000)
}

const errorMessages = computed<Record<string, string>>(() => ({
  STEAM_OPENID_INVALID: 'Falha ao validar a resposta da Steam. Tente novamente.',
  STEAM_ALREADY_LINKED_TO_OTHER_USER: 'Esta conta Steam já está vinculada a outro usuário.',
  STEAM_REPLACE_REQUIRES_UNLINK: 'Desconecte a conta atual antes de vincular outra.',
  MISSING_STATE: 'Sessão expirou. Faça login e tente conectar de novo.',
}))

onMounted(() => {
  handleQuery()
})

watch(() => route.query.steam, () => handleQuery())

function handleQuery() {
  const status = route.query.steam
  const code = (route.query.code as string) ?? ''
  if (status === 'connected') {
    setBanner('Steam conectada com sucesso!', true)
    router.replace({ query: { ...route.query, steam: undefined, code: undefined } })
  } else if (status === 'error') {
    const msg = errorMessages.value[code] ?? `Erro ao conectar (${code || 'desconhecido'}).`
    setBanner(msg, false)
    router.replace({ query: { ...route.query, steam: undefined, code: undefined } })
  }
}
</script>
