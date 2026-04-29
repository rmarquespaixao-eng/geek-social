<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  X, Camera, Crown, Shield, User as UserIcon, MoreVertical,
  UserPlus, LogOut, Trash2, Pencil, Check,
} from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useChat } from '../composables/useChat'
import * as chatService from '../services/chatService'
import AppModal from '@/shared/ui/AppModal.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import type { Conversation, ConversationMember, MemberRole } from '../types'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'left'): void }>()

const auth = useAuthStore()
const friends = useFriends()
const chat = useChat()

const me = computed(() => auth.user?.id ?? '')
const myRole = computed<MemberRole | null>(() => {
  return props.conversation.participants.find(p => p.userId === me.value)?.role ?? null
})
const isOwner = computed(() => myRole.value === 'owner')
const isAdmin = computed(() => myRole.value === 'admin' || myRole.value === 'owner')

const editingName = ref(false)
const editingDesc = ref(false)
const nameValue = ref(props.conversation.name ?? '')
const descValue = ref(props.conversation.description ?? '')
const memberMenuOpenFor = ref<string | null>(null)
const showAddMembers = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const coverInputRef = ref<HTMLInputElement | null>(null)

// confirmações
const removeTarget = ref<ConversationMember | null>(null)
const showLeaveConfirm = ref(false)
const showDeleteConfirm = ref(false)
const performing = ref(false)

function roleBadge(role: MemberRole) {
  if (role === 'owner') return { label: 'Dono', icon: Crown, cls: 'text-amber-400 bg-amber-500/15' }
  if (role === 'admin') return { label: 'Admin', icon: Shield, cls: 'text-blue-400 bg-blue-500/15' }
  return { label: 'Membro', icon: UserIcon, cls: 'text-(--color-text-muted) bg-(--color-bg-elevated)' }
}

async function saveName() {
  if (!isAdmin.value || !nameValue.value.trim()) return
  saving.value = true
  error.value = null
  try {
    await chatService.updateGroup(props.conversation.id, { name: nameValue.value.trim() })
    await chat.fetchConversations()
    editingName.value = false
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao salvar'
  } finally { saving.value = false }
}

async function saveDescription() {
  if (!isAdmin.value) return
  saving.value = true
  error.value = null
  try {
    await chatService.updateGroup(props.conversation.id, { description: descValue.value.trim() })
    await chat.fetchConversations()
    editingDesc.value = false
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao salvar'
  } finally { saving.value = false }
}

async function uploadCover(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !isAdmin.value) return
  saving.value = true
  error.value = null
  try {
    await chatService.uploadGroupCover(props.conversation.id, file)
    await chat.fetchConversations()
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao enviar imagem'
  } finally {
    saving.value = false
    input.value = ''
  }
}

async function changeRole(member: ConversationMember, role: MemberRole) {
  if (!isOwner.value) return
  memberMenuOpenFor.value = null
  try {
    await chatService.updateMemberRole(props.conversation.id, member.userId, role)
    await chat.fetchConversations()
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao alterar papel'
  }
}

function askRemoveMember(member: ConversationMember) {
  if (!isOwner.value) return
  memberMenuOpenFor.value = null
  removeTarget.value = member
}

async function confirmRemoveMember() {
  const member = removeTarget.value
  if (!member || performing.value) return
  performing.value = true
  try {
    await chatService.removeMember(props.conversation.id, member.userId)
    await chat.fetchConversations()
    removeTarget.value = null
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao remover'
  } finally {
    performing.value = false
  }
}

function askLeave() { showLeaveConfirm.value = true }

async function confirmLeave() {
  if (performing.value) return
  performing.value = true
  try {
    await chatService.leaveGroup(props.conversation.id)
    chat.conversations = chat.conversations.filter(c => c.id !== props.conversation.id)
    emit('left')
    emit('close')
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao sair'
  } finally {
    performing.value = false
  }
}

function askDelete() { if (isOwner.value) showDeleteConfirm.value = true }

async function confirmDelete() {
  if (!isOwner.value || performing.value) return
  performing.value = true
  try {
    await chatService.deleteGroup(props.conversation.id)
    chat.conversations = chat.conversations.filter(c => c.id !== props.conversation.id)
    emit('left')
    emit('close')
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao excluir'
  } finally {
    performing.value = false
  }
}

const friendsAvailableToAdd = computed(() => {
  const memberIds = new Set(props.conversation.participants.map(p => p.userId))
  return friends.friends.filter(f => !memberIds.has(f.id))
})

async function addFriend(friendId: string) {
  try {
    await chatService.inviteMember(props.conversation.id, friendId)
    await chat.fetchConversations()
  } catch (e: any) {
    error.value = e?.response?.data?.error ?? 'Erro ao adicionar amigo'
  }
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-member-menu]')) memberMenuOpenFor.value = null
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))

const sortedParticipants = computed(() => {
  return [...props.conversation.participants].sort((a, b) => {
    const order = { owner: 0, admin: 1, member: 2 }
    return order[a.role] - order[b.role]
  })
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      @click.self="emit('close')"
    >
      <div class="bg-(--color-bg-surface) rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="h-14 flex items-center justify-between px-5 border-b border-(--color-bg-elevated) flex-shrink-0">
          <h3 class="text-base font-bold text-(--color-text-primary)">Detalhes do grupo</h3>
          <button @click="emit('close')" class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary)">
            <X :size="18" />
          </button>
        </div>

        <div class="overflow-y-auto flex-1 p-5 space-y-5">
          <!-- Cover -->
          <div class="flex flex-col items-center gap-3">
            <div class="relative">
              <img
                v-if="conversation.coverUrl"
                :src="conversation.coverUrl"
                :alt="conversation.name ?? ''"
                class="w-24 h-24 rounded-2xl object-cover"
              />
              <div
                v-else
                class="w-24 h-24 rounded-2xl bg-(--color-bg-elevated) flex items-center justify-center text-3xl font-bold text-(--color-text-secondary)"
              >
                {{ (conversation.name ?? '?').charAt(0).toUpperCase() }}
              </div>
              <button
                v-if="isAdmin"
                @click="coverInputRef?.click()"
                class="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-(--color-accent-amber) text-black flex items-center justify-center hover:bg-amber-400 shadow-lg"
                title="Mudar imagem"
              >
                <Camera :size="14" />
              </button>
              <input
                ref="coverInputRef"
                type="file"
                accept="image/*"
                class="hidden"
                @change="uploadCover"
              />
            </div>

            <!-- Nome -->
            <div class="w-full text-center">
              <div v-if="!editingName" class="flex items-center justify-center gap-2">
                <h2 class="text-lg font-bold text-(--color-text-primary)">{{ conversation.name }}</h2>
                <button
                  v-if="isAdmin"
                  @click="editingName = true; nameValue = conversation.name ?? ''"
                  class="p-1 rounded text-(--color-text-muted) hover:text-(--color-text-primary)"
                >
                  <Pencil :size="14" />
                </button>
              </div>
              <div v-else class="flex items-center gap-2 max-w-xs mx-auto">
                <input
                  v-model="nameValue"
                  type="text"
                  maxlength="100"
                  class="flex-1 px-3 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)"
                  @keydown.enter="saveName"
                />
                <button
                  :disabled="saving"
                  @click="saveName"
                  class="p-1.5 rounded-lg bg-(--color-accent-amber) text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  <Check :size="14" />
                </button>
                <button @click="editingName = false" class="p-1.5 rounded-lg text-(--color-text-muted) hover:bg-(--color-bg-elevated)">
                  <X :size="14" />
                </button>
              </div>
              <p class="text-xs text-(--color-text-muted) mt-1">
                {{ conversation.participants.length }} {{ conversation.participants.length === 1 ? 'participante' : 'participantes' }}
              </p>
            </div>
          </div>

          <!-- Descrição -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">Descrição</span>
              <button
                v-if="isAdmin && !editingDesc"
                @click="editingDesc = true; descValue = conversation.description ?? ''"
                class="text-xs text-(--color-accent-amber) hover:underline"
              >
                Editar
              </button>
            </div>
            <p v-if="!editingDesc" class="text-sm text-(--color-text-secondary) whitespace-pre-wrap">
              {{ conversation.description || (isAdmin ? 'Sem descrição. Clique em editar.' : 'Sem descrição.') }}
            </p>
            <div v-else class="flex flex-col gap-2">
              <textarea
                v-model="descValue"
                rows="3"
                maxlength="500"
                class="w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-sm text-(--color-text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber) resize-none"
              />
              <div class="flex justify-end gap-2">
                <button @click="editingDesc = false" class="px-3 py-1 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-elevated) text-sm">
                  Cancelar
                </button>
                <button :disabled="saving" @click="saveDescription" class="px-3 py-1 rounded-lg bg-(--color-accent-amber) text-black hover:bg-amber-400 text-sm font-medium disabled:opacity-50">
                  Salvar
                </button>
              </div>
            </div>
          </div>

          <!-- Participantes -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">Participantes</span>
              <button
                v-if="isAdmin"
                @click="showAddMembers = !showAddMembers"
                class="text-xs text-(--color-accent-amber) hover:underline flex items-center gap-1"
              >
                <UserPlus :size="12" /> Adicionar
              </button>
            </div>

            <!-- Lista pra adicionar -->
            <div v-if="showAddMembers" class="mb-3 p-3 rounded-lg bg-(--color-bg-elevated) space-y-2">
              <p v-if="friendsAvailableToAdd.length === 0" class="text-xs text-(--color-text-muted) text-center py-2">
                Nenhum amigo disponível para adicionar
              </p>
              <div
                v-for="f in friendsAvailableToAdd"
                :key="f.id"
                class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-(--color-bg-surface)"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <img
                    v-if="f.avatarUrl"
                    :src="f.avatarUrl"
                    class="w-7 h-7 rounded-full object-cover"
                    :alt="f.displayName"
                  />
                  <div v-else class="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200">
                    {{ f.displayName.charAt(0).toUpperCase() }}
                  </div>
                  <span class="text-sm text-(--color-text-primary) truncate">{{ f.displayName }}</span>
                </div>
                <button @click="addFriend(f.id)" class="text-xs text-(--color-accent-amber) hover:underline">
                  Adicionar
                </button>
              </div>
            </div>

            <ul class="space-y-1">
              <li
                v-for="p in sortedParticipants"
                :key="p.userId"
                class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-(--color-bg-elevated)"
              >
                <img
                  v-if="p.avatarUrl"
                  :src="p.avatarUrl"
                  :alt="p.displayName"
                  class="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
                <div v-else class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200 flex-shrink-0">
                  {{ p.displayName.charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-(--color-text-primary) truncate">
                    {{ p.displayName }}
                    <span v-if="p.userId === me" class="text-xs text-(--color-text-muted) font-normal">(você)</span>
                  </p>
                  <span :class="['inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] mt-0.5', roleBadge(p.role).cls]">
                    <component :is="roleBadge(p.role).icon" :size="10" />
                    {{ roleBadge(p.role).label }}
                  </span>
                </div>

                <!-- Menu owner-only para outros membros -->
                <div
                  v-if="isOwner && p.userId !== me"
                  class="relative"
                  data-member-menu
                >
                  <button
                    @click.stop="memberMenuOpenFor = memberMenuOpenFor === p.userId ? null : p.userId"
                    class="p-1.5 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-surface)"
                  >
                    <MoreVertical :size="16" />
                  </button>
                  <div
                    v-if="memberMenuOpenFor === p.userId"
                    class="absolute right-0 top-9 z-10 min-w-[180px] rounded-xl bg-(--color-bg-elevated) border border-(--color-bg-surface) shadow-xl py-1"
                  >
                    <button
                      v-if="p.role === 'member'"
                      @click="changeRole(p, 'admin')"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-surface)"
                    >
                      <Shield :size="14" /> Tornar admin
                    </button>
                    <button
                      v-if="p.role === 'admin'"
                      @click="changeRole(p, 'member')"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-surface)"
                    >
                      <UserIcon :size="14" /> Remover admin
                    </button>
                    <button
                      @click="askRemoveMember(p)"
                      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 :size="14" /> Remover do grupo
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <p v-if="error" class="text-sm text-red-400 text-center">{{ error }}</p>
        </div>

        <!-- Footer ações -->
        <div class="flex items-center justify-between gap-2 px-5 py-3 border-t border-(--color-bg-elevated) flex-shrink-0">
          <button
            @click="askLeave"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated)"
          >
            <LogOut :size="14" /> Sair do grupo
          </button>
          <button
            v-if="isOwner"
            @click="askDelete"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10"
          >
            <Trash2 :size="14" /> Excluir grupo
          </button>
        </div>
      </div>
    </div>

  </Teleport>

  <AppConfirmDialog
    :open="!!removeTarget"
    :title="removeTarget ? `Remover ${removeTarget.displayName}?` : ''"
    description="A pessoa deixará de fazer parte do grupo. Você pode adicioná-la novamente depois."
    confirm-label="Remover"
    :loading="performing"
    @cancel="removeTarget = null"
    @confirm="confirmRemoveMember"
  />

  <AppConfirmDialog
    :open="showLeaveConfirm"
    title="Sair deste grupo?"
    description="Você perderá acesso às mensagens. Para voltar, alguém do grupo precisará te convidar novamente."
    confirm-label="Sair"
    :loading="performing"
    @cancel="showLeaveConfirm = false"
    @confirm="confirmLeave"
  />

  <AppConfirmDialog
    :open="showDeleteConfirm"
    title="Excluir grupo"
    description="O grupo será apagado permanentemente para todos os membros, junto com todas as mensagens. Esta ação não pode ser desfeita."
    confirm-label="Excluir grupo"
    :loading="performing"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />
</template>
