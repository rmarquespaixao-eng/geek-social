<template>
  <div class="min-h-screen bg-(--color-bg-base)">
    <AppPageHeader :icon="SettingsIcon" title="Configurações">
      <template #subtitle>
        <span>Perfil, segurança e sessão</span>
      </template>
    </AppPageHeader>

    <div class="py-6 px-4 md:px-8">
      <div class="max-w-2xl mx-auto">

      <!-- Tabs -->
      <div class="flex flex-wrap gap-1 mb-6 bg-(--color-bg-card) rounded-2xl p-1.5 border border-(--color-bg-elevated)">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors flex-1 min-w-[110px] justify-center',
            activeTab === tab.id
              ? 'bg-(--color-bg-elevated) text-(--color-accent-amber)'
              : 'text-(--color-text-secondary) hover:text-(--color-text-primary)',
          ]"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" />
          <span class="hidden sm:inline">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Aba: Segurança -->
      <div v-if="activeTab === 'security'" class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated)">
        <h2 class="text-base font-semibold text-(--color-text-primary) mb-2">
          {{ hasPassword ? 'Alterar senha' : 'Definir senha' }}
        </h2>
        <p v-if="!hasPassword" class="text-sm text-(--color-text-muted) mb-4">
          Sua conta foi criada via login social. Defina uma senha para também poder entrar com e-mail e senha.
        </p>
        <form @submit.prevent="savePassword" class="flex flex-col gap-4">
          <div v-if="hasPassword" class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-(--color-text-secondary)">Senha atual</label>
            <input
              v-model="passwordForm.current"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border border-transparent text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20 transition-colors"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-(--color-text-secondary)">
              {{ hasPassword ? 'Nova senha' : 'Senha' }}
            </label>
            <input
              v-model="passwordForm.newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="Mínimo 8 caracteres"
              class="w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border border-transparent text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20 transition-colors"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-(--color-text-secondary)">
              {{ hasPassword ? 'Confirmar nova senha' : 'Confirmar senha' }}
            </label>
            <input
              v-model="passwordForm.confirm"
              type="password"
              autocomplete="new-password"
              placeholder="Repita a senha"
              class="w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border border-transparent text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20 transition-colors"
            />
          </div>
          <p v-if="passwordSuccess" class="text-sm text-(--color-status-online) bg-(--color-status-online)/10 rounded-lg px-3 py-2">
            {{ hasPassword ? 'Senha alterada com sucesso!' : 'Senha definida com sucesso!' }}
          </p>
          <p v-if="passwordError" class="text-sm text-(--color-danger) bg-(--color-danger)/10 rounded-lg px-3 py-2">
            {{ passwordError }}
          </p>
          <div class="flex justify-end">
            <AppButton type="submit" variant="primary" :loading="savingPassword">
              {{ hasPassword ? 'Alterar senha' : 'Definir senha' }}
            </AppButton>
          </div>
        </form>
      </div>

      <!-- Aba: Privacidade do chat -->
      <div v-if="activeTab === 'privacy'" class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated)">
        <h2 class="text-base font-semibold text-(--color-text-primary) mb-4">Privacidade do chat</h2>
        <div class="flex flex-col gap-4">
          <label class="flex items-start justify-between gap-4 cursor-pointer">
            <div class="flex-1">
              <p class="text-sm text-(--color-text-primary) font-medium">Aparecer online</p>
              <p class="text-xs text-(--color-text-muted)">Se desligado, amigos não veem quando você está online nem a última vez que foi visto.</p>
            </div>
            <input
              type="checkbox"
              class="mt-1 accent-(--color-accent-amber) scale-125"
              :checked="chatPrivacy.showPresence"
              :disabled="savingChatPrivacy"
              @change="(e: Event) => saveChatPrivacy('showPresence', (e.target as HTMLInputElement).checked)"
            />
          </label>
          <label class="flex items-start justify-between gap-4 cursor-pointer">
            <div class="flex-1">
              <p class="text-sm text-(--color-text-primary) font-medium">Mostrar confirmação de leitura</p>
              <p class="text-xs text-(--color-text-muted)">Se desligado, você também não verá quando outros leram suas mensagens.</p>
            </div>
            <input
              type="checkbox"
              class="mt-1 accent-(--color-accent-amber) scale-125"
              :checked="chatPrivacy.showReadReceipts"
              :disabled="savingChatPrivacy"
              @change="(e: Event) => saveChatPrivacy('showReadReceipts', (e.target as HTMLInputElement).checked)"
            />
          </label>
          <p v-if="chatPrivacyError" class="text-sm text-(--color-danger) bg-(--color-danger)/10 rounded-lg px-3 py-2">
            {{ chatPrivacyError }}
          </p>
          <p v-if="chatPrivacySuccess" class="text-sm text-(--color-status-online) bg-(--color-status-online)/10 rounded-lg px-3 py-2">
            Configurações atualizadas.
          </p>
        </div>
      </div>

      <!-- Aba: Criptografia -->
      <div v-if="activeTab === 'encryption'" class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated) flex flex-col gap-6">
        <div>
          <h2 class="text-base font-semibold text-(--color-text-primary) mb-2">Criptografia ponta a ponta</h2>
          <p class="text-sm text-(--color-text-muted)">Suas mensagens privadas e em grupo são protegidas com Signal Protocol. Apenas você e os destinatários conseguem lê-las.</p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm text-(--color-text-secondary)">Status:</span>
          <span
            v-if="cryptoReady"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-(--color-status-online)/10 text-(--color-status-online)"
          >
            <ShieldCheck :size="12" /> Ativa
          </span>
          <span
            v-else
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-(--color-bg-elevated) text-(--color-text-muted)"
          >
            Não inicializada
          </span>
        </div>

        <div v-if="identityFingerprint">
          <p class="text-sm font-medium text-(--color-text-secondary) mb-1.5">Sua impressão digital</p>
          <p class="text-xs text-(--color-text-muted) mb-2">Compare com seus contatos por um canal alternativo (chamada, presencial) para confirmar a identidade.</p>
          <code class="block text-xs font-mono bg-(--color-bg-elevated) text-(--color-text-primary) rounded-lg px-3 py-2 break-all">{{ identityFingerprint }}</code>
        </div>

        <div>
          <p class="text-sm font-medium text-(--color-text-secondary) mb-1.5">Backup com PIN</p>
          <p class="text-xs text-(--color-text-muted) mb-3">Defina ou atualize o PIN que protege seu backup de identidade. Você precisará dele para restaurar a criptografia em outro dispositivo.</p>
          <form @submit.prevent="saveBackup" class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-(--color-text-secondary)">Novo PIN</label>
              <input
                v-model="backupForm.pin"
                type="password"
                autocomplete="new-password"
                placeholder="Mínimo 6 caracteres"
                class="w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border border-transparent text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20 transition-colors"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-(--color-text-secondary)">Confirmar PIN</label>
              <input
                v-model="backupForm.confirm"
                type="password"
                autocomplete="new-password"
                placeholder="Repita o PIN"
                class="w-full px-3 py-2.5 rounded-lg bg-(--color-bg-elevated) border border-transparent text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:border-(--color-accent-amber) focus:ring-(--color-accent-amber)/20 transition-colors"
              />
            </div>
            <p v-if="backupSuccess" class="text-sm text-(--color-status-online) bg-(--color-status-online)/10 rounded-lg px-3 py-2">Backup atualizado com sucesso.</p>
            <p v-if="backupError" class="text-sm text-(--color-danger) bg-(--color-danger)/10 rounded-lg px-3 py-2">{{ backupError }}</p>
            <div class="flex justify-end">
              <AppButton type="submit" variant="primary" :loading="savingBackup" :disabled="!cryptoReady">
                Salvar backup
              </AppButton>
            </div>
          </form>
        </div>

        <div v-if="dmConversations.length > 0">
          <p class="text-sm font-medium text-(--color-text-secondary) mb-1.5">Reparar sessões</p>
          <p class="text-xs text-(--color-text-muted) mb-3">Force a renegociação da sessão de uma conversa privada se as mensagens novas não estiverem sendo decifradas. Mensagens antigas não serão recuperadas.</p>
          <ul class="flex flex-col gap-2">
            <li
              v-for="conv in dmConversations"
              :key="conv.id"
              class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-(--color-bg-elevated)"
            >
              <span class="text-sm text-(--color-text-primary) truncate">{{ conv.name || conv.id }}</span>
              <div class="flex items-center gap-2 shrink-0">
                <span
                  v-if="repairResults[peerOf(conv.participants) ?? ''] === 'ok'"
                  class="text-xs text-(--color-status-online)"
                >Reparado</span>
                <span
                  v-else-if="repairResults[peerOf(conv.participants) ?? ''] === 'fail'"
                  class="text-xs text-(--color-danger)"
                >Falhou</span>
                <AppButton
                  variant="ghost"
                  :loading="repairingPeer === peerOf(conv.participants)"
                  :disabled="!cryptoReady || !peerOf(conv.participants)"
                  @click="() => { const id = peerOf(conv.participants); if (id) handleRepair(id) }"
                >
                  Reparar
                </AppButton>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Aba: Integrações -->
      <div v-if="activeTab === 'integrations'">
        <GoogleConnectCard />
        <SteamConnectCard />
      </div>

      <!-- Aba: Sessão -->
      <div v-if="activeTab === 'session'" class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated)">
        <h2 class="text-base font-semibold text-(--color-text-primary) mb-2">Sessão</h2>
        <p class="text-sm text-(--color-text-muted) mb-4">Encerrar a sessão neste dispositivo.</p>
        <AppButton variant="danger" @click="handleLogout">
          Sair da conta
        </AppButton>
      </div>

      <!-- Aba: Conta -->
      <div v-if="activeTab === 'account'" class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated)">
        <h2 class="text-base font-semibold text-(--color-text-primary) mb-2">Excluir conta</h2>
        <p class="text-sm text-(--color-text-muted) mb-4">
          Esta ação remove permanentemente sua conta e todos os dados associados — perfil, coleções, posts, ofertas, mensagens e arquivos. Não há como desfazer.
        </p>
        <AppButton variant="danger" @click="showDeleteAccountModal = true">
          <Trash2 :size="14" />
          Excluir minha conta
        </AppButton>
      </div>
      </div>
    </div>

    <AppConfirmDialog
      :open="showDeleteAccountModal"
      title="Excluir conta permanentemente?"
      confirm-label="Excluir conta"
      :loading="deletingAccount"
      @cancel="showDeleteAccountModal = false"
      @confirm="confirmDeleteAccount"
    >
      <p class="text-sm">
        Você tem certeza que deseja excluir sua conta? Todos os seus dados — perfil, coleções, items, anúncios, ofertas, mensagens e amizades — serão removidos permanentemente.
      </p>
      <p v-if="deleteAccountError" class="mt-2 text-xs text-(--color-danger)">{{ deleteAccountError }}</p>
    </AppConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Settings as SettingsIcon, Lock, Eye as EyeIcon, Plug, LogOut, Trash2, ShieldCheck,
} from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useAuth } from '@/shared/auth/useAuth'
import { useChat } from '@/modules/chat/composables/useChat'
import {
  isReady as cryptoIsReady,
  getMyIdentityFingerprint,
  updateBackup,
  repairDmSession,
} from '@/modules/chat/services/chatCrypto'
import SteamConnectCard from '@/modules/integrations/steam/components/SteamConnectCard.vue'
import GoogleConnectCard from '../components/GoogleConnectCard.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import * as usersService from '../services/usersService'

type TabId = 'security' | 'privacy' | 'encryption' | 'integrations' | 'session' | 'account'

const tabs: { id: TabId; label: string; icon: any }[] = [
  { id: 'security', label: 'Segurança', icon: Lock },
  { id: 'privacy', label: 'Privacidade', icon: EyeIcon },
  { id: 'encryption', label: 'Criptografia', icon: ShieldCheck },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'session', label: 'Sessão', icon: LogOut },
  { id: 'account', label: 'Conta', icon: Trash2 },
]
const activeTab = ref<TabId>('security')

const router = useRouter()

const store = useAuthStore()
const { logout, loadUser } = useAuth()
const user = computed(() => store.user)
const hasPassword = computed(() => user.value?.hasPassword !== false)

onMounted(() => {
  if (user.value) {
    chatPrivacy.showPresence = user.value.showPresence ?? true
    chatPrivacy.showReadReceipts = user.value.showReadReceipts ?? true
  }
})

const passwordForm = reactive({ current: '', newPassword: '', confirm: '' })
const savingPassword = ref(false)
const passwordSuccess = ref(false)
const passwordError = ref('')

const chatPrivacy = reactive({
  showPresence: true,
  showReadReceipts: true,
})
const savingChatPrivacy = ref(false)
const chatPrivacyError = ref('')
const chatPrivacySuccess = ref(false)

async function saveChatPrivacy(field: 'showPresence' | 'showReadReceipts', next: boolean) {
  savingChatPrivacy.value = true
  chatPrivacyError.value = ''
  chatPrivacySuccess.value = false
  const old = chatPrivacy[field]
  chatPrivacy[field] = next
  try {
    const updated = await usersService.updateSettings({ [field]: next })
    chatPrivacy.showPresence = updated.showPresence
    chatPrivacy.showReadReceipts = updated.showReadReceipts
    if (store.user) {
      store.user.showPresence = updated.showPresence
      store.user.showReadReceipts = updated.showReadReceipts
    }
    chatPrivacySuccess.value = true
    setTimeout(() => { chatPrivacySuccess.value = false }, 2000)
  } catch (err: any) {
    chatPrivacy[field] = old
    chatPrivacyError.value = err.response?.data?.error ?? 'Erro ao atualizar.'
  } finally {
    savingChatPrivacy.value = false
  }
}

async function savePassword() {
  passwordError.value = ''
  passwordSuccess.value = false

  if (passwordForm.newPassword.length < 8) {
    passwordError.value = 'A senha deve ter pelo menos 8 caracteres.'
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirm) {
    passwordError.value = 'As senhas não coincidem.'
    return
  }

  savingPassword.value = true
  try {
    if (hasPassword.value) {
      await usersService.changePassword(passwordForm.current, passwordForm.newPassword)
    } else {
      await usersService.setInitialPassword(passwordForm.newPassword)
      await loadUser()
    }
    passwordForm.current = ''
    passwordForm.newPassword = ''
    passwordForm.confirm = ''
    passwordSuccess.value = true
    setTimeout(() => { passwordSuccess.value = false }, 3000)
  } catch (err: any) {
    passwordError.value = err.response?.data?.error ?? 'Erro ao salvar senha.'
  } finally {
    savingPassword.value = false
  }
}

async function handleLogout() {
  await logout()
}

// ── Encryption tab ───────────────────────────────────────────────────────────

const chat = useChat()
const cryptoReady = computed(() => cryptoIsReady())
const identityFingerprint = computed(() => getMyIdentityFingerprint())
const dmConversations = computed(() =>
  chat.conversations.filter((c) => c.type === 'dm'),
)

const backupForm = reactive({ pin: '', confirm: '' })
const savingBackup = ref(false)
const backupSuccess = ref(false)
const backupError = ref('')

async function saveBackup() {
  backupError.value = ''
  backupSuccess.value = false
  if (backupForm.pin.length < 6) {
    backupError.value = 'O PIN deve ter pelo menos 6 caracteres.'
    return
  }
  if (backupForm.pin !== backupForm.confirm) {
    backupError.value = 'Os PINs não coincidem.'
    return
  }
  savingBackup.value = true
  try {
    await updateBackup(backupForm.pin)
    backupForm.pin = ''
    backupForm.confirm = ''
    backupSuccess.value = true
    setTimeout(() => { backupSuccess.value = false }, 3000)
  } catch (err: any) {
    backupError.value = err?.response?.data?.error ?? 'Não foi possível atualizar o backup.'
  } finally {
    savingBackup.value = false
  }
}

const repairingPeer = ref<string | null>(null)
const repairResults = reactive<Record<string, 'ok' | 'fail'>>({})

function peerOf(participants: { userId: string }[]): string | null {
  const me = store.user?.id
  return participants.find((p) => p.userId !== me)?.userId ?? null
}

async function handleRepair(peerUserId: string) {
  repairingPeer.value = peerUserId
  delete repairResults[peerUserId]
  try {
    const ok = await repairDmSession(peerUserId)
    repairResults[peerUserId] = ok ? 'ok' : 'fail'
  } finally {
    repairingPeer.value = null
  }
}

const showDeleteAccountModal = ref(false)
const deletingAccount = ref(false)
const deleteAccountError = ref('')

async function confirmDeleteAccount() {
  deletingAccount.value = true
  deleteAccountError.value = ''
  try {
    await usersService.deleteAccount()
    showDeleteAccountModal.value = false
    // Limpa estado local e força login screen
    store.clearAuth()
    router.replace({ name: 'login' })
  } catch (err: any) {
    deleteAccountError.value = err.response?.data?.error ?? 'Erro ao excluir conta.'
  } finally {
    deletingAccount.value = false
  }
}
</script>
