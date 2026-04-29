# Frontend — Sub-projeto 3: Amigos e Privacidade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo de amizades no frontend: listagem de amigos (com presença online), gerenciamento de pedidos recebidos/enviados, bloqueio de usuários e o botão de adicionar amigo integrado ao perfil público.

**Architecture:** Módulo `src/modules/friends/` autodependente com serviço HTTP próprio (`friendsService.ts`), store Pinia (`useFriends.ts`) que expõe `pendingCount` para a sidebar, e componentes de apresentação desacoplados usados tanto em `FriendsView` quanto em `ProfileView`. Presença online (`isOnline`) é um campo retornado diretamente pela API — sem WebSocket neste sub-projeto.

**Tech Stack:** Vue 3 + TypeScript, Tailwind CSS v4, Pinia, Axios

**Pré-requisito:** Sub-projetos 1 e 2 completos.

---

## Paleta de Cores (referência rápida)

| Token | Valor | Uso |
|---|---|---|
| `bg-[#0f0f1a]` | base | fundo da página |
| `bg-[#1a1b2e]` | surface | painéis/sidebar |
| `bg-[#1e2038]` | card | cards de amigo |
| `bg-[#252640]` | elevated | hover/dropdown |
| `text-[#e2e8f0]` | text-primary | nomes, títulos |
| `text-[#94a3b8]` | text-secondary | status, datas |
| `bg-[#f59e0b]` / `text-[#f59e0b]` | amber | acento, botão primário |
| `bg-[#22c55e]` | online | dot de presença online |
| `bg-[#475569]` | offline | dot de presença offline |
| `text-[#ef4444]` / `border-[#ef4444]` | danger | rejeitar, desbloquear |

---

## Estrutura de Arquivos

**Criar:**
```
src/modules/friends/types.ts
src/modules/friends/services/friendsService.ts
src/modules/friends/composables/useFriends.ts
src/modules/friends/components/FriendItem.vue
src/modules/friends/components/FriendRequestItem.vue
src/modules/friends/components/BlockedUserItem.vue
src/modules/friends/components/SendRequestButton.vue
src/modules/friends/views/FriendsView.vue
```

**Modificar:**
```
src/router/index.ts              — rota /friends
src/components/AppSidebar.vue   — badge pendingCount no item Amigos
src/modules/users/views/ProfileView.vue — integrar SendRequestButton + menu Bloquear
```

---

## Task 1: Types + FriendsService

**Files:**
- Create: `src/modules/friends/types.ts`
- Create: `src/modules/friends/services/friendsService.ts`

- [ ] **Step 1: Criar `types.ts`**

```typescript
// src/modules/friends/types.ts

export interface FriendRequest {
  id: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  receiverId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

export interface Friend {
  id: string
  displayName: string
  avatarUrl: string | null
  isOnline: boolean
  lastSeenAt: string | null
}

export interface BlockedUser {
  id: string
  displayName: string
  avatarUrl: string | null
}
```

- [ ] **Step 2: Criar `friendsService.ts`**

```typescript
// src/modules/friends/services/friendsService.ts
import axios from '@/lib/axios' // instância configurada com baseURL + auth header
import type { Friend, FriendRequest, BlockedUser } from '../types'

// ── Friends ──────────────────────────────────────────────────────────────────

export async function listFriends(): Promise<Friend[]> {
  const { data } = await axios.get<Friend[]>('/friends')
  return data
}

export async function removeFriend(friendId: string): Promise<void> {
  await axios.delete(`/friends/${friendId}`)
}

// ── Requests ─────────────────────────────────────────────────────────────────

export async function sendRequest(receiverId: string): Promise<FriendRequest> {
  const { data } = await axios.post<FriendRequest>('/friends/requests', { receiverId })
  return data
}

export async function listReceived(): Promise<FriendRequest[]> {
  const { data } = await axios.get<FriendRequest[]>('/friends/requests/received')
  return data
}

export async function listSent(): Promise<FriendRequest[]> {
  const { data } = await axios.get<FriendRequest[]>('/friends/requests/sent')
  return data
}

export async function acceptRequest(id: string): Promise<void> {
  await axios.post(`/friends/requests/${id}/accept`)
}

export async function rejectRequest(id: string): Promise<void> {
  await axios.post(`/friends/requests/${id}/reject`)
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export async function blockUser(userId: string): Promise<void> {
  await axios.post(`/blocks/${userId}`)
}

export async function unblockUser(userId: string): Promise<void> {
  await axios.delete(`/blocks/${userId}`)
}

export async function listBlocked(): Promise<BlockedUser[]> {
  const { data } = await axios.get<BlockedUser[]>('/blocks')
  return data
}
```

- [ ] **Step 3: Commit**

```
git add src/modules/friends/types.ts src/modules/friends/services/friendsService.ts
git commit -m "feat(friends): add types and friendsService HTTP layer"
```

---

## Task 2: useFriends Pinia Store + Badge na Sidebar

**Files:**
- Create: `src/modules/friends/composables/useFriends.ts`
- Modify: `src/components/AppSidebar.vue`

- [ ] **Step 1: Criar `useFriends.ts`**

```typescript
// src/modules/friends/composables/useFriends.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as svc from '../services/friendsService'
import type { Friend, FriendRequest, BlockedUser } from '../types'

export const useFriends = defineStore('friends', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const friends = ref<Friend[]>([])
  const receivedRequests = ref<FriendRequest[]>([])
  const sentRequests = ref<FriendRequest[]>([])
  const blockedUsers = ref<BlockedUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Computed ───────────────────────────────────────────────────────────────
  const pendingCount = computed(() => receivedRequests.value.length)

  const onlineFriends = computed(() =>
    friends.value.filter((f) => f.isOnline)
  )
  const offlineFriends = computed(() =>
    friends.value.filter((f) => !f.isOnline)
  )

  // ── Actions ────────────────────────────────────────────────────────────────
  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const [friendsList, received, sent, blocked] = await Promise.all([
        svc.listFriends(),
        svc.listReceived(),
        svc.listSent(),
        svc.listBlocked(),
      ])
      friends.value = friendsList
      receivedRequests.value = received
      sentRequests.value = sent
      blockedUsers.value = blocked
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao carregar amigos'
    } finally {
      loading.value = false
    }
  }

  async function acceptRequest(id: string) {
    await svc.acceptRequest(id)
    const req = receivedRequests.value.find((r) => r.id === id)
    receivedRequests.value = receivedRequests.value.filter((r) => r.id !== id)
    if (req) {
      // Otimisticamente adiciona à lista de amigos até o próximo fetchAll
      friends.value.push({
        id: req.senderId,
        displayName: req.senderName,
        avatarUrl: req.senderAvatarUrl,
        isOnline: false,
        lastSeenAt: null,
      })
    }
  }

  async function rejectRequest(id: string) {
    await svc.rejectRequest(id)
    receivedRequests.value = receivedRequests.value.filter((r) => r.id !== id)
  }

  async function removeFriend(friendId: string) {
    await svc.removeFriend(friendId)
    friends.value = friends.value.filter((f) => f.id !== friendId)
  }

  async function blockUser(userId: string) {
    await svc.blockUser(userId)
    // Remove da lista de amigos se for amigo
    const wasFriend = friends.value.find((f) => f.id === userId)
    friends.value = friends.value.filter((f) => f.id !== userId)
    // Remove pedidos pendentes envolvendo esse usuário
    receivedRequests.value = receivedRequests.value.filter(
      (r) => r.senderId !== userId
    )
    sentRequests.value = sentRequests.value.filter(
      (r) => r.receiverId !== userId
    )
    if (wasFriend) {
      blockedUsers.value.push({
        id: userId,
        displayName: wasFriend.displayName,
        avatarUrl: wasFriend.avatarUrl,
      })
    }
  }

  async function unblockUser(userId: string) {
    await svc.unblockUser(userId)
    blockedUsers.value = blockedUsers.value.filter((b) => b.id !== userId)
  }

  async function sendRequest(receiverId: string) {
    const req = await svc.sendRequest(receiverId)
    sentRequests.value.push(req)
  }

  return {
    // state
    friends,
    receivedRequests,
    sentRequests,
    blockedUsers,
    loading,
    error,
    // computed
    pendingCount,
    onlineFriends,
    offlineFriends,
    // actions
    fetchAll,
    acceptRequest,
    rejectRequest,
    removeFriend,
    blockUser,
    unblockUser,
    sendRequest,
  }
})
```

- [ ] **Step 2: Atualizar `AppSidebar.vue` — badge de pedidos pendentes**

Localizar o item de navegação correspondente a "Amigos" (provavelmente com ícone `Users` do lucide-vue-next e rota `/friends`) e adicionar o badge condicional.

Padrão de importação e uso:

```typescript
// No <script setup> do AppSidebar.vue
import { useFriends } from '@/modules/friends/composables/useFriends'
const friendsStore = useFriends()
// pendingCount já é computed reativo — use diretamente no template
```

Padrão do badge no template (adaptar ao markup existente do item Amigos):

```html
<!-- Dentro do <li> / botão do item Amigos na sidebar -->
<span
  v-if="friendsStore.pendingCount > 0"
  class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-xs font-bold text-white"
>
  {{ friendsStore.pendingCount }}
</span>
```

> **Nota:** O `useFriends()` store deve ser inicializado via `fetchAll()` no componente raiz (App.vue ou layout autenticado) após login, para que o badge já apareça ao carregar qualquer tela.

- [ ] **Step 3: Commit**

```
git add src/modules/friends/composables/useFriends.ts src/components/AppSidebar.vue
git commit -m "feat(friends): add useFriends Pinia store and sidebar pending badge"
```

---

## Task 3: Componentes de Lista

**Files:**
- Create: `src/modules/friends/components/FriendItem.vue`
- Create: `src/modules/friends/components/FriendRequestItem.vue`
- Create: `src/modules/friends/components/BlockedUserItem.vue`

- [ ] **Step 1: Criar `FriendItem.vue`**

```vue
<!-- src/modules/friends/components/FriendItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, MoreHorizontal, UserMinus, UserX, Eye } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import type { Friend } from '../types'

const props = defineProps<{ friend: Friend }>()
const emit = defineEmits<{ removed: [id: string] }>()

const router = useRouter()
const store = useFriends()
const menuOpen = ref(false)

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'há algum tempo'
  const diff = Date.now() - new Date(lastSeenAt).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

async function handleRemove() {
  menuOpen.value = false
  await store.removeFriend(props.friend.id)
  emit('removed', props.friend.id)
}

async function handleBlock() {
  menuOpen.value = false
  await store.blockUser(props.friend.id)
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl bg-[#1e2038] px-4 py-3 hover:bg-[#252640] transition-colors">
    <!-- Avatar + dot de presença -->
    <div class="relative shrink-0">
      <img
        v-if="friend.avatarUrl"
        :src="friend.avatarUrl"
        :alt="friend.displayName"
        class="h-10 w-10 rounded-full object-cover"
      />
      <div
        v-else
        class="flex h-10 w-10 items-center justify-center rounded-full bg-[#252640] text-sm font-bold text-[#f59e0b]"
      >
        {{ friend.displayName.charAt(0).toUpperCase() }}
      </div>
      <span
        :class="[
          'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#1e2038]',
          friend.isOnline ? 'bg-[#22c55e]' : 'bg-[#475569]',
        ]"
      />
    </div>

    <!-- Nome + status -->
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium text-[#e2e8f0]">{{ friend.displayName }}</p>
      <p class="text-xs text-[#94a3b8]">
        {{ friend.isOnline ? 'online' : `visto ${formatLastSeen(friend.lastSeenAt)}` }}
      </p>
    </div>

    <!-- Ações -->
    <div class="flex items-center gap-1">
      <!-- Botão chat (sub-projeto 5) -->
      <router-link
        to="/chat"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-[#94a3b8] hover:bg-[#252640] hover:text-[#f59e0b] transition-colors"
        title="Enviar mensagem"
      >
        <MessageCircle class="h-4 w-4" />
      </router-link>

      <!-- Menu ⋯ -->
      <div class="relative">
        <button
          class="flex h-8 w-8 items-center justify-center rounded-lg text-[#94a3b8] hover:bg-[#252640] hover:text-[#e2e8f0] transition-colors"
          @click="menuOpen = !menuOpen"
        >
          <MoreHorizontal class="h-4 w-4" />
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 top-9 z-20 min-w-[170px] rounded-xl border border-[#252640] bg-[#1a1b2e] py-1 shadow-xl"
          @mouseleave="menuOpen = false"
        >
          <router-link
            :to="`/profile/${friend.displayName}`"
            class="flex items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
            @click="menuOpen = false"
          >
            <Eye class="h-4 w-4" />
            Ver perfil
          </router-link>
          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#ef4444] hover:bg-[#252640] transition-colors"
            @click="handleRemove"
          >
            <UserMinus class="h-4 w-4" />
            Remover amigo
          </button>
          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#252640] transition-colors"
            @click="handleBlock"
          >
            <UserX class="h-4 w-4" />
            Bloquear
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Criar `FriendRequestItem.vue`**

```vue
<!-- src/modules/friends/components/FriendRequestItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import type { FriendRequest } from '../types'

const props = defineProps<{ request: FriendRequest }>()
const emit = defineEmits<{ handled: [id: string] }>()

const store = useFriends()
const loading = ref(false)

async function handleAccept() {
  loading.value = true
  try {
    await store.acceptRequest(props.request.id)
    emit('handled', props.request.id)
  } finally {
    loading.value = false
  }
}

async function handleReject() {
  loading.value = true
  try {
    await store.rejectRequest(props.request.id)
    emit('handled', props.request.id)
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl bg-[#1e2038] px-4 py-3">
    <!-- Avatar -->
    <div class="shrink-0">
      <img
        v-if="request.senderAvatarUrl"
        :src="request.senderAvatarUrl"
        :alt="request.senderName"
        class="h-10 w-10 rounded-full object-cover"
      />
      <div
        v-else
        class="flex h-10 w-10 items-center justify-center rounded-full bg-[#252640] text-sm font-bold text-[#f59e0b]"
      >
        {{ request.senderName.charAt(0).toUpperCase() }}
      </div>
    </div>

    <!-- Info -->
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium text-[#e2e8f0]">{{ request.senderName }}</p>
      <p class="text-xs text-[#94a3b8]">Pedido enviado em {{ formatDate(request.createdAt) }}</p>
    </div>

    <!-- Ações -->
    <div class="flex items-center gap-2">
      <button
        :disabled="loading"
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/30 disabled:opacity-50 transition-colors"
        title="Aceitar"
        @click="handleAccept"
      >
        <Check class="h-4 w-4" />
      </button>
      <button
        :disabled="loading"
        class="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50 transition-colors"
        title="Rejeitar"
        @click="handleReject"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Criar `BlockedUserItem.vue`**

```vue
<!-- src/modules/friends/components/BlockedUserItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { ShieldOff } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import type { BlockedUser } from '../types'

const props = defineProps<{ user: BlockedUser }>()
const emit = defineEmits<{ unblocked: [id: string] }>()

const store = useFriends()
const loading = ref(false)

async function handleUnblock() {
  loading.value = true
  try {
    await store.unblockUser(props.user.id)
    emit('unblocked', props.user.id)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl bg-[#1e2038] px-4 py-3">
    <!-- Avatar -->
    <div class="shrink-0">
      <img
        v-if="user.avatarUrl"
        :src="user.avatarUrl"
        :alt="user.displayName"
        class="h-10 w-10 rounded-full object-cover opacity-60 grayscale"
      />
      <div
        v-else
        class="flex h-10 w-10 items-center justify-center rounded-full bg-[#252640] text-sm font-bold text-[#94a3b8]"
      >
        {{ user.displayName.charAt(0).toUpperCase() }}
      </div>
    </div>

    <!-- Nome -->
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium text-[#94a3b8]">{{ user.displayName }}</p>
      <p class="text-xs text-[#475569]">Bloqueado</p>
    </div>

    <!-- Desbloquear -->
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-lg border border-[#475569]/50 px-3 py-1.5 text-xs font-medium text-[#94a3b8] hover:border-[#f59e0b]/50 hover:text-[#f59e0b] disabled:opacity-50 transition-colors"
      @click="handleUnblock"
    >
      <ShieldOff class="h-3.5 w-3.5" />
      Desbloquear
    </button>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```
git add src/modules/friends/components/
git commit -m "feat(friends): add FriendItem, FriendRequestItem and BlockedUserItem components"
```

---

## Task 4: FriendsView + Rota

**Files:**
- Create: `src/modules/friends/views/FriendsView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Criar `FriendsView.vue`**

```vue
<!-- src/modules/friends/views/FriendsView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Users, UserCheck, Shield } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import FriendItem from '../components/FriendItem.vue'
import FriendRequestItem from '../components/FriendRequestItem.vue'
import BlockedUserItem from '../components/BlockedUserItem.vue'

type Tab = 'friends' | 'requests' | 'blocked'

const store = useFriends()
const activeTab = ref<Tab>('friends')

onMounted(() => store.fetchAll())

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a] px-4 py-8 md:px-8">
    <div class="mx-auto max-w-2xl">
      <!-- Título -->
      <h1 class="mb-6 text-2xl font-bold text-[#e2e8f0]">Amigos</h1>

      <!-- Tabs -->
      <div class="mb-6 flex gap-1 rounded-xl bg-[#1a1b2e] p-1">
        <!-- Amigos -->
        <button
          class="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'friends'
            ? 'bg-[#252640] text-[#e2e8f0]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="activeTab = 'friends'"
        >
          <Users class="h-4 w-4" />
          Amigos ({{ store.friends.length }})
        </button>

        <!-- Pedidos -->
        <button
          class="relative flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'requests'
            ? 'bg-[#252640] text-[#e2e8f0]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="activeTab = 'requests'"
        >
          <UserCheck class="h-4 w-4" />
          Pedidos
          <span
            v-if="store.pendingCount > 0"
            class="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-xs font-bold text-white"
          >
            {{ store.pendingCount }}
          </span>
        </button>

        <!-- Bloqueados -->
        <button
          class="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors"
          :class="activeTab === 'blocked'
            ? 'bg-[#252640] text-[#e2e8f0]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="activeTab = 'blocked'"
        >
          <Shield class="h-4 w-4" />
          Bloqueados ({{ store.blockedUsers.length }})
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="store.loading" class="space-y-3">
        <div
          v-for="i in 3"
          :key="i"
          class="h-16 animate-pulse rounded-xl bg-[#1e2038]"
        />
      </div>

      <!-- Error state -->
      <div
        v-else-if="store.error"
        class="rounded-xl bg-[#1e2038] px-4 py-6 text-center text-[#ef4444]"
      >
        {{ store.error }}
        <button class="ml-2 underline" @click="store.fetchAll()">Tentar novamente</button>
      </div>

      <template v-else>
        <!-- ── Aba Amigos ──────────────────────────────────────────────── -->
        <div v-if="activeTab === 'friends'">
          <!-- Online -->
          <div v-if="store.onlineFriends.length > 0" class="mb-4">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Online — {{ store.onlineFriends.length }}
            </h2>
            <div class="space-y-2">
              <FriendItem
                v-for="friend in store.onlineFriends"
                :key="friend.id"
                :friend="friend"
              />
            </div>
          </div>

          <!-- Offline -->
          <div v-if="store.offlineFriends.length > 0">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Offline — {{ store.offlineFriends.length }}
            </h2>
            <div class="space-y-2">
              <FriendItem
                v-for="friend in store.offlineFriends"
                :key="friend.id"
                :friend="friend"
              />
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-if="store.friends.length === 0"
            class="rounded-xl bg-[#1e2038] px-4 py-10 text-center"
          >
            <Users class="mx-auto mb-3 h-10 w-10 text-[#475569]" />
            <p class="font-medium text-[#e2e8f0]">Nenhum amigo ainda</p>
            <p class="mt-1 text-sm text-[#94a3b8]">
              Encontre pessoas navegando para o perfil delas em
              <code class="rounded bg-[#252640] px-1 text-[#f59e0b]">/profile/&lt;username&gt;</code>
            </p>
          </div>
        </div>

        <!-- ── Aba Pedidos ──────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'requests'">
          <!-- Recebidos -->
          <div class="mb-6">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Recebidos — {{ store.receivedRequests.length }}
            </h2>
            <div v-if="store.receivedRequests.length > 0" class="space-y-2">
              <FriendRequestItem
                v-for="req in store.receivedRequests"
                :key="req.id"
                :request="req"
              />
            </div>
            <div
              v-else
              class="rounded-xl bg-[#1e2038] px-4 py-6 text-center text-sm text-[#94a3b8]"
            >
              Nenhum pedido recebido
            </div>
          </div>

          <!-- Enviados -->
          <div>
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              Enviados — {{ store.sentRequests.length }}
            </h2>
            <div v-if="store.sentRequests.length > 0" class="space-y-2">
              <div
                v-for="req in store.sentRequests"
                :key="req.id"
                class="flex items-center gap-3 rounded-xl bg-[#1e2038] px-4 py-3"
              >
                <!-- Avatar -->
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#252640] text-sm font-bold text-[#f59e0b]">
                  {{ req.senderName.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-[#e2e8f0]">{{ req.senderName }}</p>
                  <p class="text-xs text-[#94a3b8]">Enviado em {{ formatDate(req.createdAt) }}</p>
                </div>
                <span class="rounded-full bg-[#252640] px-2.5 py-1 text-xs text-[#94a3b8]">
                  Pendente
                </span>
              </div>
            </div>
            <div
              v-else
              class="rounded-xl bg-[#1e2038] px-4 py-6 text-center text-sm text-[#94a3b8]"
            >
              Nenhum pedido enviado
            </div>
          </div>
        </div>

        <!-- ── Aba Bloqueados ──────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'blocked'">
          <div v-if="store.blockedUsers.length > 0" class="space-y-2">
            <BlockedUserItem
              v-for="user in store.blockedUsers"
              :key="user.id"
              :user="user"
            />
          </div>
          <div
            v-else
            class="rounded-xl bg-[#1e2038] px-4 py-10 text-center"
          >
            <Shield class="mx-auto mb-3 h-10 w-10 text-[#475569]" />
            <p class="font-medium text-[#e2e8f0]">Nenhum usuário bloqueado</p>
            <p class="mt-1 text-sm text-[#94a3b8]">
              Você pode bloquear alguém a partir do perfil ou da lista de amigos.
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Adicionar rota `/friends` no router**

Localizar `src/router/index.ts` e adicionar a rota dentro do array de rotas autenticadas (dentro do layout protegido, se houver):

```typescript
{
  path: '/friends',
  name: 'friends',
  component: () => import('@/modules/friends/views/FriendsView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 3: Commit**

```
git add src/modules/friends/views/FriendsView.vue src/router/index.ts
git commit -m "feat(friends): add FriendsView with tabs (friends/requests/blocked) and router"
```

---

## Task 5: SendRequestButton no ProfileView

**Files:**
- Create: `src/modules/friends/components/SendRequestButton.vue`
- Modify: `src/modules/users/views/ProfileView.vue`

- [ ] **Step 1: Criar `SendRequestButton.vue`**

O componente recebe o `userId` do perfil visitado e exibe o estado correto com base nos dados do store.

```vue
<!-- src/modules/friends/components/SendRequestButton.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { UserPlus, Check, Clock, ShieldOff, UserMinus } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'

const props = defineProps<{ userId: string }>()
const emit = defineEmits<{ statusChanged: [] }>()

const store = useFriends()
const loading = ref(false)

// Derivar estado a partir do store
const isFriend = computed(() =>
  store.friends.some((f) => f.id === props.userId)
)
const requestSent = computed(() =>
  store.sentRequests.some((r) => r.receiverId === props.userId)
)
const requestReceived = computed(() =>
  store.receivedRequests.find((r) => r.senderId === props.userId)
)
const isBlocked = computed(() =>
  store.blockedUsers.some((b) => b.id === props.userId)
)

async function handleAdd() {
  loading.value = true
  try {
    await store.sendRequest(props.userId)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleAccept() {
  if (!requestReceived.value) return
  loading.value = true
  try {
    await store.acceptRequest(requestReceived.value.id)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleReject() {
  if (!requestReceived.value) return
  loading.value = true
  try {
    await store.rejectRequest(requestReceived.value.id)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleRemove() {
  loading.value = true
  try {
    await store.removeFriend(props.userId)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleUnblock() {
  loading.value = true
  try {
    await store.unblockUser(props.userId)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- Bloqueado -->
  <div v-if="isBlocked" class="flex items-center gap-2">
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#475569]/50 px-4 py-2 text-sm font-medium text-[#94a3b8] hover:border-[#f59e0b]/50 hover:text-[#f59e0b] disabled:opacity-50 transition-colors"
      @click="handleUnblock"
    >
      <ShieldOff class="h-4 w-4" />
      Desbloquear
    </button>
  </div>

  <!-- Pedido recebido desse usuário -->
  <div v-else-if="requestReceived" class="flex items-center gap-2">
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16a34a] disabled:opacity-50 transition-colors"
      @click="handleAccept"
    >
      <Check class="h-4 w-4" />
      Aceitar
    </button>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 px-4 py-2 text-sm font-medium text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50 transition-colors"
      @click="handleReject"
    >
      Rejeitar
    </button>
  </div>

  <!-- Já é amigo -->
  <div v-else-if="isFriend" class="flex items-center gap-2">
    <button
      class="flex cursor-default items-center gap-1.5 rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#22c55e]"
    >
      <Check class="h-4 w-4" />
      Amigo
    </button>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 px-3 py-2 text-sm text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50 transition-colors"
      title="Remover amigo"
      @click="handleRemove"
    >
      <UserMinus class="h-4 w-4" />
    </button>
  </div>

  <!-- Pedido enviado (aguardando) -->
  <div v-else-if="requestSent">
    <button
      disabled
      class="flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#94a3b8] opacity-70"
    >
      <Clock class="h-4 w-4" />
      Pedido enviado
    </button>
  </div>

  <!-- Sem relacionamento -->
  <div v-else>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-[#0f0f1a] hover:bg-[#d97706] disabled:opacity-50 transition-colors"
      @click="handleAdd"
    >
      <UserPlus class="h-4 w-4" />
      Adicionar amigo
    </button>
  </div>
</template>
```

- [ ] **Step 2: Integrar `SendRequestButton` no `ProfileView.vue`**

Adicionar no `<script setup>` do `ProfileView.vue`:

```typescript
import SendRequestButton from '@/modules/friends/components/SendRequestButton.vue'
import { useFriends } from '@/modules/friends/composables/useFriends'

const friendsStore = useFriends()
// Garante que o store está carregado ao visitar um perfil
onMounted(() => {
  if (friendsStore.friends.length === 0) friendsStore.fetchAll()
})
```

No template, ao lado do botão "Mensagem" existente (adaptar conforme markup atual):

```html
<!-- Área de ações do perfil — visível apenas quando NÃO é o próprio usuário -->
<div v-if="!isOwnProfile" class="flex items-center gap-2">
  <SendRequestButton :user-id="profile.id" />
  <!-- botão Mensagem já existente -->
</div>
```

> `isOwnProfile` deve ser uma computed já existente em ProfileView (ou criar: `const isOwnProfile = computed(() => authStore.user?.id === profile.value?.id)`).

- [ ] **Step 3: Commit**

```
git add src/modules/friends/components/SendRequestButton.vue src/modules/users/views/ProfileView.vue
git commit -m "feat(friends): add SendRequestButton and integrate into ProfileView"
```

---

## Task 6: Bloquear usuário a partir do perfil + tratamento de 404

**Files:**
- Modify: `src/modules/users/views/ProfileView.vue`

- [ ] **Step 1: Menu ⋯ "Bloquear usuário" no ProfileView**

Adicionar no `<script setup>` do `ProfileView.vue`:

```typescript
import { useRouter } from 'vue-router'
const router = useRouter()

async function handleBlockFromProfile() {
  if (!profile.value) return
  await friendsStore.blockUser(profile.value.id)
  // Redireciona para a aba Bloqueados
  router.push({ path: '/friends', query: { tab: 'blocked' } })
}
```

No template, acrescentar ao menu ⋯ do perfil (adaptar ao componente existente):

```html
<button
  class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#252640] transition-colors"
  @click="handleBlockFromProfile"
>
  <UserX class="h-4 w-4" />
  Bloquear usuário
</button>
```

> **Nota:** Para que o redirecionamento de `?tab=blocked` funcione, o `FriendsView.vue` deve ler `useRoute().query.tab` no `onMounted` e setar `activeTab` correspondente:
>
> ```typescript
> import { useRoute } from 'vue-router'
> const route = useRoute()
> onMounted(() => {
>   store.fetchAll()
>   if (route.query.tab === 'blocked') activeTab.value = 'blocked'
> })
> ```

- [ ] **Step 2: Tratamento de 404 no ProfileView (usuário bloqueado)**

Quando a API retorna 404 ao visitar `/profile/:username` (usuário bloqueou o visitante ou não existe), exibir página de "Usuário não encontrado".

No `<script setup>` do `ProfileView.vue`, detectar o erro:

```typescript
const notFound = ref(false)

async function loadProfile(username: string) {
  try {
    // chamada existente ao serviço de perfil
    profile.value = await usersService.getPublicProfile(username)
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      notFound.value = true
    }
  }
}
```

No template, antes do conteúdo normal do perfil:

```html
<!-- Estado 404 -->
<div
  v-if="notFound"
  class="flex min-h-[60vh] flex-col items-center justify-center text-center"
>
  <UserX class="mb-4 h-16 w-16 text-[#475569]" />
  <h2 class="text-xl font-bold text-[#e2e8f0]">Usuário não encontrado</h2>
  <p class="mt-2 text-sm text-[#94a3b8]">
    Este perfil não existe ou não está disponível para você.
  </p>
  <router-link
    to="/"
    class="mt-6 rounded-xl bg-[#f59e0b] px-5 py-2 text-sm font-semibold text-[#0f0f1a] hover:bg-[#d97706] transition-colors"
  >
    Voltar para o início
  </router-link>
</div>

<!-- Conteúdo normal do perfil -->
<template v-else>
  <!-- ... conteúdo existente ... -->
</template>
```

- [ ] **Step 3: Atualizar `FriendsView.vue` para ler `?tab` da URL**

```typescript
// Adicionar no onMounted existente do FriendsView.vue
import { useRoute } from 'vue-router'
const route = useRoute()

onMounted(() => {
  store.fetchAll()
  const tabParam = route.query.tab
  if (tabParam === 'blocked') activeTab.value = 'blocked'
  else if (tabParam === 'requests') activeTab.value = 'requests'
})
```

- [ ] **Step 4: Commit**

```
git add src/modules/users/views/ProfileView.vue src/modules/friends/views/FriendsView.vue
git commit -m "feat(friends): block from profile, redirect to blocked tab, 404 handling"
```

---

## Resumo dos commits

| Task | Commit |
|---|---|
| 1 | `feat(friends): add types and friendsService HTTP layer` |
| 2 | `feat(friends): add useFriends Pinia store and sidebar pending badge` |
| 3 | `feat(friends): add FriendItem, FriendRequestItem and BlockedUserItem components` |
| 4 | `feat(friends): add FriendsView with tabs (friends/requests/blocked) and router` |
| 5 | `feat(friends): add SendRequestButton and integrate into ProfileView` |
| 6 | `feat(friends): block from profile, redirect to blocked tab, 404 handling` |

---

## Checklist de QA antes de marcar como completo

- [ ] Badge vermelho aparece na sidebar ao ter pedidos pendentes e some ao aceitar/rejeitar todos
- [ ] Amigos online aparecem antes dos offline na lista
- [ ] Dot verde/cinza de presença condiz com `isOnline` retornado pela API
- [ ] Aceitar pedido move o usuário para a lista de amigos (otimisticamente)
- [ ] Rejeitar pedido remove o card sem recarregar a página
- [ ] Bloquear um amigo remove-o da lista de amigos e adiciona em Bloqueados
- [ ] Desbloquear remove da lista de Bloqueados
- [ ] Visitar perfil de usuário que não existe ou que bloqueou o visitante exibe a tela 404
- [ ] Bloquear a partir do perfil redireciona para `/friends?tab=blocked`
- [ ] `SendRequestButton` exibe o estado correto em cada cenário (sem relação / enviado / recebido / amigo / bloqueado)
- [ ] Não há busca de usuários por texto — a decisão de não implementar está refletida no estado vazio da aba Amigos
