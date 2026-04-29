<!-- src/modules/reports/components/ReportDialog.vue
  Modal reutilizável para denunciar mensagens, posts, perfis e coleções.
  Plug em qualquer menu ⋯ chamando: <ReportDialog v-if="open" :target-type :target-id :open @close @reported />
-->
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Flag, AlertTriangle, UserX, Trash2 } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useChat } from '@/modules/chat/composables/useChat'
import { createReport, type ReportTargetType, type ReportReason } from '../services/reportsService'

const props = defineProps<{
  open: boolean
  targetType: ReportTargetType
  targetId: string
  /** ID do usuário a oferecer bloqueio pós-denúncia (sender da mensagem, autor do post, etc). */
  blockableUserId?: string | null
  /** Nome para mostrar no checkbox "Bloquear X". */
  blockableUserName?: string | null
  /** ID da conversa a oferecer apagar (chat-context: DM/grupo onde a denúncia foi feita). */
  deletableConversationId?: string | null
}>()

const emit = defineEmits<{
  close: []
  reported: []
}>()

const friends = useFriends()
const chat = useChat()

const REASONS: Array<{ key: ReportReason; label: string; description: string }> = [
  { key: 'spam',       label: 'Spam',                 description: 'Conteúdo repetitivo, comercial ou enganoso.' },
  { key: 'harassment', label: 'Assédio ou bullying',  description: 'Ataques pessoais, ameaças, intimidação.' },
  { key: 'nsfw',       label: 'Conteúdo sexual',      description: 'Nudez, conteúdo explícito não autorizado.' },
  { key: 'hate',       label: 'Discurso de ódio',     description: 'Ataques baseados em raça, gênero, religião, etc.' },
  { key: 'other',      label: 'Outro motivo',         description: 'Use a descrição abaixo para detalhar.' },
]

const TARGET_LABELS: Record<ReportTargetType, string> = {
  user:         'usuário',
  message:      'mensagem',
  post:         'post',
  collection:   'coleção',
  conversation: 'conversa',
}

const reason = ref<ReportReason | null>(null)
const description = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
const successSummary = ref<string[]>([])
const alsoBlock = ref(false)
const alsoDelete = ref(false)

const showFollowUp = computed(() => Boolean(props.blockableUserId || props.deletableConversationId))

watch(() => props.open, (open) => {
  if (open) {
    reason.value = null
    description.value = ''
    error.value = null
    success.value = false
    successSummary.value = []
    alsoBlock.value = false
    alsoDelete.value = false
    submitting.value = false
  }
})

async function submit() {
  if (!reason.value || submitting.value) return
  submitting.value = true
  error.value = null
  const summary: string[] = []
  try {
    await createReport({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      description: description.value.trim() || null,
    })
    summary.push('Denúncia enviada')

    // Ações adicionais opcionais. Cada uma é independente — se uma falhar, a outra ainda roda.
    if (alsoBlock.value && props.blockableUserId) {
      try {
        await friends.blockUser(props.blockableUserId)
        summary.push(`${props.blockableUserName ?? 'Usuário'} bloqueado`)
      } catch {
        summary.push('Bloqueio falhou — tente pelo perfil')
      }
    }

    if (alsoDelete.value && props.deletableConversationId) {
      try {
        await chat.hideConversation(props.deletableConversationId)
        summary.push('Conversa apagada')
      } catch {
        summary.push('Falha ao apagar conversa')
      }
    }

    successSummary.value = summary
    success.value = true
    setTimeout(() => {
      emit('reported')
      emit('close')
    }, 1500)
  } catch (e: any) {
    const code = e?.response?.data?.error
    error.value = code === 'ALREADY_REPORTED'  ? 'Você já denunciou este conteúdo.'
                : code === 'CANNOT_REPORT_OWN' ? 'Você não pode denunciar seu próprio conteúdo.'
                : code === 'TARGET_NOT_FOUND'  ? 'Conteúdo não encontrado ou removido.'
                : 'Erro ao enviar denúncia. Tente novamente.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="sm" @close="emit('close')">
      <div class="p-5 space-y-4">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-danger)/10 flex-shrink-0">
            <Flag class="h-5 w-5 text-(--color-danger)" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-(--color-text-primary)">
              Denunciar {{ TARGET_LABELS[targetType] }}
            </h2>
            <p class="text-xs text-(--color-text-muted)">
              Sua denúncia será revisada. Não compartilhamos sua identidade com o denunciado.
            </p>
          </div>
        </div>

        <!-- Sucesso -->
        <div
          v-if="success"
          class="space-y-1.5 px-3 py-2.5 rounded-lg bg-(--color-status-online)/10 text-(--color-status-online) text-sm"
        >
          <p v-for="line in successSummary" :key="line" class="flex items-center gap-2">
            <span>✓</span>
            <span>{{ line }}</span>
          </p>
        </div>

        <template v-else>
          <!-- Razões -->
          <div class="space-y-1.5">
            <label
              v-for="opt in REASONS"
              :key="opt.key"
              class="flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors"
              :class="reason === opt.key
                ? 'border-(--color-accent-amber) bg-(--color-accent-amber)/5'
                : 'border-(--color-bg-elevated) hover:border-(--color-text-muted)/40'"
            >
              <input
                type="radio"
                v-model="reason"
                :value="opt.key"
                class="mt-1 accent-(--color-accent-amber)"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-(--color-text-primary)">{{ opt.label }}</p>
                <p class="text-xs text-(--color-text-muted)">{{ opt.description }}</p>
              </div>
            </label>
          </div>

          <!-- Descrição -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-(--color-text-secondary)">
              Detalhes (opcional)
            </label>
            <textarea
              v-model="description"
              rows="3"
              maxlength="2000"
              placeholder="Descreva o problema..."
              class="w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) placeholder-(--color-text-muted) text-sm resize-none focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20 border border-transparent focus:border-(--color-accent-amber)"
            />
            <p class="text-[10px] text-(--color-text-muted) text-right">{{ description.length }}/2000</p>
          </div>

          <!-- Ações adicionais (bloquear / apagar conversa) -->
          <div v-if="showFollowUp" class="space-y-1 pt-2 border-t border-(--color-bg-elevated)">
            <p class="text-xs font-medium text-(--color-text-secondary)">Ações adicionais</p>
            <label
              v-if="props.blockableUserId"
              class="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated)/40 rounded-lg"
            >
              <input type="checkbox" v-model="alsoBlock" class="accent-(--color-accent-amber)" />
              <UserX :size="14" class="text-(--color-text-muted)" />
              <span>Bloquear {{ props.blockableUserName ?? 'usuário' }}</span>
            </label>
            <label
              v-if="props.deletableConversationId"
              class="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated)/40 rounded-lg"
            >
              <input type="checkbox" v-model="alsoDelete" class="accent-(--color-accent-amber)" />
              <Trash2 :size="14" class="text-(--color-text-muted)" />
              <span>Apagar esta conversa</span>
            </label>
          </div>

          <!-- Erro -->
          <div
            v-if="error"
            class="flex items-start gap-2 px-3 py-2 rounded-lg bg-(--color-danger)/10 text-(--color-danger) text-xs"
          >
            <AlertTriangle :size="14" class="mt-0.5 flex-shrink-0" />
            <span>{{ error }}</span>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              :disabled="submitting"
              @click="emit('close')"
            >
              Cancelar
            </button>
            <AppButton
              variant="danger"
              :loading="submitting"
              :disabled="!reason"
              @click="submit"
            >
              Enviar denúncia
            </AppButton>
          </div>
        </template>
      </div>
    </AppModal>
  </Teleport>
</template>
