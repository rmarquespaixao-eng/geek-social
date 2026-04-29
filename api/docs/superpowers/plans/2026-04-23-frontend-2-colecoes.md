# Frontend — Sub-projeto 2: Coleções e Itens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo de Coleções e Itens no frontend Vue 3 — CRUD completo de coleções (5 tipos) e itens, upload de capas, campos customizados, e visualização em grade/lista com visual dark soft.

**Architecture:** Módulo `src/modules/collections/` seguindo a estrutura modular estabelecida no Sub-projeto 1: services (HTTP) → composables (Pinia store) → components → views. Services consomem a instância Axios de `src/shared/http/api.ts` com JWT injetado automaticamente. Composables expõem estado reativo e métodos de mutação. Views são páginas roteáveis lazy-loaded. Nenhum módulo importa de outro módulo.

**Tech Stack:** Vue 3 + TypeScript, Tailwind CSS v4, Pinia, Axios

**Pré-requisito:** Sub-projeto 1 completo (shared layer, router, AppSidebar disponíveis).

---

## Estrutura de Arquivos

**Novos:**
```
src/modules/collections/
├── components/
│   ├── CollectionCard.vue
│   ├── CollectionCoverUpload.vue
│   ├── ItemCard.vue
│   ├── ItemRow.vue
│   ├── CollectionForm.vue
│   └── ItemForm.vue
├── composables/
│   ├── useCollections.ts
│   └── useItems.ts
├── services/
│   ├── collectionsService.ts
│   └── itemsService.ts
├── views/
│   ├── CollectionsView.vue
│   ├── CollectionDetailView.vue
│   └── ItemDetailView.vue
└── types.ts
```

**Modificados:**
```
src/router/index.ts            — adicionar rotas /collections, /collections/:id, /collections/:id/items/:itemId
src/shared/ui/AppModal.vue     — criado aqui se ainda não existir
```

---

## Task 1: Types + CollectionsService

**Files:**
- Create: `src/modules/collections/types.ts`
- Create: `src/modules/collections/services/collectionsService.ts`

- [ ] **Step 1: Criar `src/modules/collections/types.ts`**

```typescript
export type CollectionType = 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom'

export interface Collection {
  id: string
  name: string
  description?: string
  type: CollectionType
  coverUrl?: string
  iconUrl?: string
  isPublic: boolean
  itemCount: number
  createdAt: string
}

export interface Item {
  id: string
  collectionId: string
  name: string
  coverUrl?: string
  rating?: number          // 1–5, inteiro ou null
  notes?: string
  customFields?: Record<string, string | number | boolean>
  isPublic: boolean
  createdAt: string
}

export type FieldDefinitionType = 'text' | 'number' | 'date' | 'boolean' | 'select'

export interface FieldDefinition {
  id: string
  name: string
  type: FieldDefinitionType
  selectOptions?: string[]
}

export interface CreateCollectionPayload {
  name: string
  description?: string
  type: CollectionType
  isPublic?: boolean
}

export interface UpdateCollectionPayload {
  name?: string
  description?: string
  isPublic?: boolean
}

export interface CreateItemPayload {
  name: string
  rating?: number
  notes?: string
  customFields?: Record<string, string | number | boolean>
  isPublic?: boolean
}

export interface UpdateItemPayload {
  name?: string
  rating?: number
  notes?: string
  customFields?: Record<string, string | number | boolean>
  isPublic?: boolean
}

export interface CreateFieldDefinitionPayload {
  name: string
  type: FieldDefinitionType
}
```

- [ ] **Step 2: Criar `src/modules/collections/services/collectionsService.ts`**

```typescript
import api from '@/shared/http/api'
import type {
  Collection,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  FieldDefinition,
  CreateFieldDefinitionPayload,
} from '../types'

export async function listCollections(): Promise<Collection[]> {
  const { data } = await api.get<Collection[]>('/collections')
  return data
}

export async function createCollection(payload: CreateCollectionPayload): Promise<Collection> {
  const { data } = await api.post<Collection>('/collections', payload)
  return data
}

export async function getCollection(id: string): Promise<Collection> {
  const { data } = await api.get<Collection>(`/collections/${id}`)
  return data
}

export async function updateCollection(id: string, payload: UpdateCollectionPayload): Promise<Collection> {
  const { data } = await api.put<Collection>(`/collections/${id}`, payload)
  return data
}

export async function deleteCollection(id: string): Promise<void> {
  await api.delete(`/collections/${id}`)
}

export async function uploadCollectionIcon(id: string, file: File): Promise<Collection> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Collection>(`/collections/${id}/icon`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadCollectionCover(id: string, file: File): Promise<Collection> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Collection>(`/collections/${id}/cover`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function listPublicCollections(userId: string): Promise<Collection[]> {
  const { data } = await api.get<Collection[]>(`/users/${userId}/collections`)
  return data
}

// Field Definitions

export async function listFieldDefinitions(): Promise<FieldDefinition[]> {
  const { data } = await api.get<FieldDefinition[]>('/field-definitions')
  return data
}

export async function createFieldDefinition(payload: CreateFieldDefinitionPayload): Promise<FieldDefinition> {
  const { data } = await api.post<FieldDefinition>('/field-definitions', payload)
  return data
}

export async function deleteFieldDefinition(id: string): Promise<void> {
  await api.delete(`/field-definitions/${id}`)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collections/types.ts src/modules/collections/services/collectionsService.ts
git commit -m "feat(collections): types + collectionsService HTTP layer"
```

---

## Task 2: ItemsService

**Files:**
- Create: `src/modules/collections/services/itemsService.ts`

- [ ] **Step 1: Criar `src/modules/collections/services/itemsService.ts`**

```typescript
import api from '@/shared/http/api'
import type { Item, CreateItemPayload, UpdateItemPayload } from '../types'

export async function listItems(collectionId: string): Promise<Item[]> {
  const { data } = await api.get<Item[]>(`/collections/${collectionId}/items`)
  return data
}

export async function createItem(collectionId: string, payload: CreateItemPayload): Promise<Item> {
  const { data } = await api.post<Item>(`/collections/${collectionId}/items`, payload)
  return data
}

export async function getItem(collectionId: string, itemId: string): Promise<Item> {
  const { data } = await api.get<Item>(`/collections/${collectionId}/items/${itemId}`)
  return data
}

export async function updateItem(
  collectionId: string,
  itemId: string,
  payload: UpdateItemPayload,
): Promise<Item> {
  const { data } = await api.put<Item>(`/collections/${collectionId}/items/${itemId}`, payload)
  return data
}

export async function deleteItem(collectionId: string, itemId: string): Promise<void> {
  await api.delete(`/collections/${collectionId}/items/${itemId}`)
}

export async function uploadItemCover(collectionId: string, itemId: string, file: File): Promise<Item> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Item>(
    `/collections/${collectionId}/items/${itemId}/cover`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/collections/services/itemsService.ts
git commit -m "feat(collections): itemsService HTTP layer"
```

---

## Task 3: useCollections + useItems Composables (Pinia Stores)

**Files:**
- Create: `src/modules/collections/composables/useCollections.ts`
- Create: `src/modules/collections/composables/useItems.ts`

- [ ] **Step 1: Criar `src/modules/collections/composables/useCollections.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Collection, CreateCollectionPayload, UpdateCollectionPayload } from '../types'
import * as collectionsService from '../services/collectionsService'

export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Collection[]>([])
  const current = ref<Collection | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchCollections() {
    loading.value = true
    error.value = null
    try {
      collections.value = await collectionsService.listCollections()
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao carregar coleções'
    } finally {
      loading.value = false
    }
  }

  async function fetchCollection(id: string) {
    loading.value = true
    error.value = null
    try {
      current.value = await collectionsService.getCollection(id)
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao carregar coleção'
    } finally {
      loading.value = false
    }
  }

  async function createCollection(payload: CreateCollectionPayload): Promise<Collection | null> {
    loading.value = true
    error.value = null
    try {
      const created = await collectionsService.createCollection(payload)
      collections.value.unshift(created)
      return created
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao criar coleção'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateCollection(id: string, payload: UpdateCollectionPayload): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await collectionsService.updateCollection(id, payload)
      const idx = collections.value.findIndex((c) => c.id === id)
      if (idx !== -1) collections.value[idx] = updated
      if (current.value?.id === id) current.value = updated
      return true
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao atualizar coleção'
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteCollection(id: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await collectionsService.deleteCollection(id)
      collections.value = collections.value.filter((c) => c.id !== id)
      return true
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao excluir coleção'
      return false
    } finally {
      loading.value = false
    }
  }

  async function uploadCover(id: string, file: File): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await collectionsService.uploadCollectionCover(id, file)
      const idx = collections.value.findIndex((c) => c.id === id)
      if (idx !== -1) collections.value[idx] = updated
      if (current.value?.id === id) current.value = updated
      return true
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao enviar capa'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    collections,
    current,
    loading,
    error,
    fetchCollections,
    fetchCollection,
    createCollection,
    updateCollection,
    deleteCollection,
    uploadCover,
  }
})
```

- [ ] **Step 2: Criar `src/modules/collections/composables/useItems.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Item, CreateItemPayload, UpdateItemPayload } from '../types'
import * as itemsService from '../services/itemsService'

export const useItemsStore = defineStore('items', () => {
  const items = ref<Item[]>([])
  const current = ref<Item | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchItems(collectionId: string) {
    loading.value = true
    error.value = null
    try {
      items.value = await itemsService.listItems(collectionId)
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao carregar itens'
    } finally {
      loading.value = false
    }
  }

  async function fetchItem(collectionId: string, itemId: string) {
    loading.value = true
    error.value = null
    try {
      current.value = await itemsService.getItem(collectionId, itemId)
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao carregar item'
    } finally {
      loading.value = false
    }
  }

  async function createItem(collectionId: string, payload: CreateItemPayload): Promise<Item | null> {
    loading.value = true
    error.value = null
    try {
      const created = await itemsService.createItem(collectionId, payload)
      items.value.unshift(created)
      return created
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao criar item'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateItem(
    collectionId: string,
    itemId: string,
    payload: UpdateItemPayload,
  ): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await itemsService.updateItem(collectionId, itemId, payload)
      const idx = items.value.findIndex((i) => i.id === itemId)
      if (idx !== -1) items.value[idx] = updated
      if (current.value?.id === itemId) current.value = updated
      return true
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao atualizar item'
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteItem(collectionId: string, itemId: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await itemsService.deleteItem(collectionId, itemId)
      items.value = items.value.filter((i) => i.id !== itemId)
      return true
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao excluir item'
      return false
    } finally {
      loading.value = false
    }
  }

  async function uploadItemCover(collectionId: string, itemId: string, file: File): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await itemsService.uploadItemCover(collectionId, itemId, file)
      const idx = items.value.findIndex((i) => i.id === itemId)
      if (idx !== -1) items.value[idx] = updated
      if (current.value?.id === itemId) current.value = updated
      return true
    } catch (e: any) {
      error.value = e?.message ?? 'Erro ao enviar capa do item'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    current,
    loading,
    error,
    fetchItems,
    fetchItem,
    createItem,
    updateItem,
    deleteItem,
    uploadItemCover,
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collections/composables/
git commit -m "feat(collections): useCollections + useItems Pinia stores"
```

---

## Task 4: CollectionCard + CollectionCoverUpload

**Files:**
- Create: `src/modules/collections/components/CollectionCard.vue`
- Create: `src/modules/collections/components/CollectionCoverUpload.vue`

- [ ] **Step 1: Criar `src/modules/collections/components/CollectionCard.vue`**

Card da coleção: área de capa 90px, placeholder com gradient + emoji por tipo, badge pública/privada, botão de upload de capa sobreposto, nome e contagem de itens abaixo.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Collection, CollectionType } from '../types'
import CollectionCoverUpload from './CollectionCoverUpload.vue'

const props = defineProps<{
  collection: Collection
}>()

const emit = defineEmits<{
  click: [id: string]
}>()

const typeEmoji: Record<CollectionType, string> = {
  games: '🎮',
  books: '📚',
  cardgames: '🃏',
  boardgames: '🎲',
  custom: '⚙️',
}

const typeGradient: Record<CollectionType, string> = {
  games: 'from-violet-900 to-indigo-900',
  books: 'from-amber-900 to-orange-900',
  cardgames: 'from-emerald-900 to-teal-900',
  boardgames: 'from-sky-900 to-blue-900',
  custom: 'from-slate-800 to-slate-900',
}

const emoji = computed(() => typeEmoji[props.collection.type])
const gradient = computed(() => typeGradient[props.collection.type])
</script>

<template>
  <div
    class="bg-[#1e2038] rounded-[10px] overflow-hidden cursor-pointer border border-[#252640] hover:border-[#f59e0b]/40 transition-all duration-200 group"
    @click="emit('click', collection.id)"
  >
    <!-- Cover area: 90px height -->
    <div class="relative h-[90px] overflow-hidden">
      <!-- Cover photo -->
      <img
        v-if="collection.coverUrl"
        :src="collection.coverUrl"
        :alt="collection.name"
        class="w-full h-full object-cover"
      />
      <!-- Placeholder gradient + emoji -->
      <div
        v-else
        :class="`bg-gradient-to-br ${gradient} w-full h-full flex items-center justify-center`"
      >
        <span class="text-4xl select-none">{{ emoji }}</span>
      </div>

      <!-- Upload cover button -->
      <div
        class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop
      >
        <CollectionCoverUpload :collection-id="collection.id" />
      </div>

      <!-- Public/private badge -->
      <div class="absolute top-2 left-2">
        <span
          v-if="collection.isPublic"
          class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30"
        >
          Pública
        </span>
        <span
          v-else
          class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#475569]/40 text-[#94a3b8] border border-[#475569]/40"
        >
          Privada
        </span>
      </div>
    </div>

    <!-- Info below cover -->
    <div class="p-3">
      <p class="text-[13px] font-semibold text-[#e2e8f0] truncate leading-tight">
        {{ collection.name }}
      </p>
      <p class="text-[11px] text-[#94a3b8] mt-0.5">
        {{ collection.itemCount }} {{ collection.itemCount === 1 ? 'item' : 'itens' }}
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Criar `src/modules/collections/components/CollectionCoverUpload.vue`**

Botão 📷 que dispara input file oculto. Ao selecionar a imagem, chama o store para upload e exibe spinner enquanto aguarda.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useCollectionsStore } from '../composables/useCollections'

const props = defineProps<{
  collectionId: string
}>()

const store = useCollectionsStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function openPicker() {
  fileInputRef.value?.click()
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  uploading.value = true
  await store.uploadCover(props.collectionId, file)
  uploading.value = false

  // Reset input so the same file can be re-selected
  if (fileInputRef.value) fileInputRef.value.value = ''
}
</script>

<template>
  <div>
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileSelected"
    />
    <button
      type="button"
      class="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
      :disabled="uploading"
      @click="openPicker"
    >
      <span v-if="uploading" class="text-[10px] animate-spin">⏳</span>
      <span v-else class="text-[13px]">📷</span>
    </button>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collections/components/CollectionCard.vue src/modules/collections/components/CollectionCoverUpload.vue
git commit -m "feat(collections): CollectionCard + CollectionCoverUpload components"
```

---

## Task 5: CollectionsView + Rota

**Files:**
- Create: `src/modules/collections/views/CollectionsView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Criar `src/modules/collections/views/CollectionsView.vue`**

Página principal de coleções. Header com botão "+ Nova". Grid 2 colunas de `CollectionCard`. Card especial dashed para criar nova. Modal de criação via `CollectionForm`.

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCollectionsStore } from '../composables/useCollections'
import CollectionCard from '../components/CollectionCard.vue'
import CollectionForm from '../components/CollectionForm.vue'
import AppModal from '@/shared/ui/AppModal.vue'

const router = useRouter()
const store = useCollectionsStore()

const showCreateModal = ref(false)

onMounted(() => {
  store.fetchCollections()
})

function goToCollection(id: string) {
  router.push(`/collections/${id}`)
}

function openCreateModal() {
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a] p-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-[20px] font-bold text-[#e2e8f0]">Minhas Coleções</h1>
        <p class="text-[12px] text-[#94a3b8] mt-0.5">
          {{ store.collections.length }} {{ store.collections.length === 1 ? 'coleção' : 'coleções' }}
        </p>
      </div>
      <button
        class="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[13px] font-semibold px-4 py-2 rounded-[6px] transition-colors"
        @click="openCreateModal"
      >
        + Nova
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="store.loading && store.collections.length === 0" class="grid grid-cols-2 gap-4">
      <div
        v-for="n in 4"
        :key="n"
        class="bg-[#1e2038] rounded-[10px] h-[140px] animate-pulse border border-[#252640]"
      />
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 gap-4">
      <!-- Existing collections -->
      <CollectionCard
        v-for="collection in store.collections"
        :key="collection.id"
        :collection="collection"
        @click="goToCollection"
      />

      <!-- New collection card (dashed) -->
      <button
        class="bg-[#1e2038]/50 rounded-[10px] border-2 border-dashed border-[#252640] hover:border-[#f59e0b]/50 hover:bg-[#1e2038] transition-all duration-200 min-h-[140px] flex flex-col items-center justify-center gap-2 group"
        @click="openCreateModal"
      >
        <span class="text-2xl group-hover:scale-110 transition-transform">➕</span>
        <span class="text-[12px] text-[#94a3b8] group-hover:text-[#f59e0b] font-medium transition-colors">
          Nova coleção
        </span>
      </button>
    </div>

    <!-- Error state -->
    <div v-if="store.error" class="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-[8px]">
      <p class="text-[13px] text-red-400">{{ store.error }}</p>
    </div>

    <!-- Create modal -->
    <AppModal v-if="showCreateModal" @close="closeCreateModal">
      <CollectionForm @close="closeCreateModal" />
    </AppModal>
  </div>
</template>
```

- [ ] **Step 2: Adicionar rota `/collections` em `src/router/index.ts`**

Localizar o array de rotas e adicionar (lazy-loaded, com guard de auth já existente):

```typescript
{
  path: '/collections',
  name: 'Collections',
  component: () => import('@/modules/collections/views/CollectionsView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 3: Adicionar item na sidebar**

Em `src/shared/ui/AppSidebar.vue`, adicionar o item de navegação de Coleções ao array de links (após Feed, antes de Amigos):

```typescript
{ path: '/collections', label: 'Coleções', icon: '🎮' }
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/collections/views/CollectionsView.vue src/router/index.ts src/shared/ui/AppSidebar.vue
git commit -m "feat(collections): CollectionsView + rota /collections + sidebar link"
```

---

## Task 6: AppModal + CollectionForm

**Files:**
- Create (se não existir): `src/shared/ui/AppModal.vue`
- Create: `src/modules/collections/components/CollectionForm.vue`

- [ ] **Step 1: Criar `src/shared/ui/AppModal.vue`** (apenas se não existir no sub-projeto 1)

Wrapper reutilizável para modais com overlay escuro e conteúdo centralizado. Fecha ao clicar no overlay ou pressionar Escape.

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{
  close: []
}>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Overlay -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <!-- Modal container -->
    <div
      class="w-full max-w-md bg-[#1e2038] rounded-[10px] border border-[#252640] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      @click.stop
    >
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Criar `src/modules/collections/components/CollectionForm.vue`**

Formulário de criação/edição de coleção: nome, descrição, tipo (select), toggle público/privado. Suporta modo `create` (sem prop) e modo `edit` (com prop `collection`).

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCollectionsStore } from '../composables/useCollections'
import type { Collection, CollectionType } from '../types'

const props = defineProps<{
  collection?: Collection   // se fornecido, modo edição
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useCollectionsStore()

const isEditMode = computed(() => !!props.collection)

const name = ref(props.collection?.name ?? '')
const description = ref(props.collection?.description ?? '')
const type = ref<CollectionType>(props.collection?.type ?? 'games')
const isPublic = ref(props.collection?.isPublic ?? true)

const typeOptions: { value: CollectionType; label: string }[] = [
  { value: 'games',      label: '🎮 Jogos' },
  { value: 'books',      label: '📚 Livros' },
  { value: 'cardgames',  label: '🃏 Card Games' },
  { value: 'boardgames', label: '🎲 Boardgames' },
  { value: 'custom',     label: '⚙️ Customizado' },
]

const submitting = ref(false)
const fieldError = ref('')

async function submit() {
  if (!name.value.trim()) {
    fieldError.value = 'O nome é obrigatório'
    return
  }
  fieldError.value = ''
  submitting.value = true

  if (isEditMode.value && props.collection) {
    await store.updateCollection(props.collection.id, {
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      isPublic: isPublic.value,
    })
  } else {
    await store.createCollection({
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      type: type.value,
      isPublic: isPublic.value,
    })
  }

  submitting.value = false
  if (!store.error) emit('close')
}
</script>

<template>
  <div class="p-5">
    <!-- Modal header -->
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-[16px] font-bold text-[#e2e8f0]">
        {{ isEditMode ? 'Editar coleção' : 'Nova coleção' }}
      </h2>
      <button
        class="w-7 h-7 rounded-full hover:bg-[#252640] flex items-center justify-center text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <!-- Name -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Nome *
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="Ex: Meus Jogos do PS5"
          maxlength="100"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors"
        />
        <p v-if="fieldError" class="text-[11px] text-red-400 mt-1">{{ fieldError }}</p>
      </div>

      <!-- Description -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Descrição
        </label>
        <textarea
          v-model="description"
          placeholder="Descrição opcional..."
          rows="2"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors resize-none"
        />
      </div>

      <!-- Type (only on create) -->
      <div v-if="!isEditMode">
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Tipo
        </label>
        <select
          v-model="type"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors cursor-pointer"
        >
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <!-- Public/private toggle -->
      <div class="flex items-center justify-between py-1">
        <div>
          <p class="text-[13px] font-medium text-[#e2e8f0]">Coleção pública</p>
          <p class="text-[11px] text-[#94a3b8]">Visível para outros usuários</p>
        </div>
        <button
          type="button"
          :class="[
            'relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none',
            isPublic ? 'bg-[#22c55e]' : 'bg-[#252640]',
          ]"
          @click="isPublic = !isPublic"
        >
          <span
            :class="[
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
              isPublic ? 'translate-x-5' : 'translate-x-0',
            ]"
          />
        </button>
      </div>

      <!-- Server error -->
      <p v-if="store.error" class="text-[12px] text-red-400">{{ store.error }}</p>

      <!-- Actions -->
      <div class="flex gap-3 pt-1">
        <button
          type="button"
          class="flex-1 bg-[#252640] hover:bg-[#2d2f52] text-[#94a3b8] text-[13px] font-medium py-2 rounded-[6px] transition-colors"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="submitting"
          class="flex-1 bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-black text-[13px] font-semibold py-2 rounded-[6px] transition-colors"
        >
          {{ submitting ? 'Salvando...' : isEditMode ? 'Salvar' : 'Criar' }}
        </button>
      </div>
    </form>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/ui/AppModal.vue src/modules/collections/components/CollectionForm.vue
git commit -m "feat(collections): AppModal + CollectionForm (criar/editar coleção)"
```

---

## Task 7: ItemCard + ItemRow

**Files:**
- Create: `src/modules/collections/components/ItemCard.vue`
- Create: `src/modules/collections/components/ItemRow.vue`

- [ ] **Step 1: Criar `src/modules/collections/components/ItemCard.vue`**

Card portrait 3:4. Capa ou placeholder com gradient. Estrelas sobrepostas no canto inferior esquerdo. Badge 🏆 (platina) se rating === 5.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Item } from '../types'

const props = defineProps<{
  item: Item
}>()

const emit = defineEmits<{
  click: [id: string]
}>()

const stars = computed(() => {
  const rating = props.item.rating ?? 0
  return Array.from({ length: 5 }, (_, i) => i < rating)
})

const isPlatinum = computed(() => props.item.rating === 5)
</script>

<template>
  <div
    class="bg-[#1e2038] rounded-[8px] overflow-hidden cursor-pointer border border-[#252640] hover:border-[#f59e0b]/40 transition-all duration-200 group"
    style="aspect-ratio: 3/4"
    @click="emit('click', item.id)"
  >
    <div class="relative w-full h-full">
      <!-- Cover image -->
      <img
        v-if="item.coverUrl"
        :src="item.coverUrl"
        :alt="item.name"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <!-- Placeholder -->
      <div
        v-else
        class="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center"
      >
        <span class="text-4xl text-[#475569] select-none">🖼️</span>
      </div>

      <!-- Platinum badge top-right -->
      <div v-if="isPlatinum" class="absolute top-2 right-2">
        <span
          class="text-lg drop-shadow-lg"
          title="Platinado"
        >🏆</span>
      </div>

      <!-- Stars overlay bottom-left -->
      <div
        v-if="item.rating"
        class="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent"
      >
        <div class="flex gap-0.5">
          <span
            v-for="(filled, i) in stars"
            :key="i"
            :class="filled ? 'text-[#f59e0b]' : 'text-[#475569]'"
            class="text-[11px]"
          >★</span>
        </div>
      </div>

      <!-- Name overlay on hover -->
      <div class="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-2">
        <p class="text-[11px] font-medium text-white truncate">{{ item.name }}</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Criar `src/modules/collections/components/ItemRow.vue`**

Linha horizontal: capa 56×74px + nome + estrelas + badge platina + menu de ações.

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Item } from '../types'

const props = defineProps<{
  item: Item
}>()

const emit = defineEmits<{
  click: [id: string]
  edit: [item: Item]
  delete: [id: string]
}>()

const menuOpen = ref(false)

const stars = computed(() => {
  const rating = props.item.rating ?? 0
  return Array.from({ length: 5 }, (_, i) => i < rating)
})

const isPlatinum = computed(() => props.item.rating === 5)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function onEdit() {
  menuOpen.value = false
  emit('edit', props.item)
}

function onDelete() {
  menuOpen.value = false
  emit('delete', props.item.id)
}
</script>

<template>
  <div
    class="flex items-center gap-3 bg-[#1e2038] hover:bg-[#252640] rounded-[8px] p-3 border border-[#252640] hover:border-[#f59e0b]/30 transition-all duration-150 cursor-pointer group"
    @click="emit('click', item.id)"
  >
    <!-- Cover thumbnail 56×74 -->
    <div class="flex-shrink-0 w-14 h-[74px] rounded-[4px] overflow-hidden bg-[#252640]">
      <img
        v-if="item.coverUrl"
        :src="item.coverUrl"
        :alt="item.name"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <span class="text-xl text-[#475569]">🖼️</span>
      </div>
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <p class="text-[13px] font-semibold text-[#e2e8f0] truncate">{{ item.name }}</p>
        <span v-if="isPlatinum" class="text-sm flex-shrink-0" title="Platinado">🏆</span>
      </div>

      <!-- Stars -->
      <div v-if="item.rating" class="flex gap-0.5 mt-1">
        <span
          v-for="(filled, i) in stars"
          :key="i"
          :class="filled ? 'text-[#f59e0b]' : 'text-[#475569]'"
          class="text-[12px]"
        >★</span>
      </div>
      <p v-else class="text-[11px] text-[#475569] mt-1">Sem avaliação</p>
    </div>

    <!-- Actions menu -->
    <div class="relative flex-shrink-0" @click.stop>
      <button
        class="w-7 h-7 rounded-full hover:bg-[#252640] group-hover:opacity-100 opacity-0 flex items-center justify-center text-[#94a3b8] hover:text-[#e2e8f0] transition-all"
        @click="toggleMenu"
      >
        ⋯
      </button>

      <!-- Dropdown menu -->
      <div
        v-if="menuOpen"
        class="absolute right-0 top-8 z-10 bg-[#252640] border border-[#333355] rounded-[6px] shadow-xl min-w-[120px] py-1"
      >
        <button
          class="w-full text-left px-3 py-1.5 text-[12px] text-[#e2e8f0] hover:bg-[#2d2f52] transition-colors"
          @click="onEdit"
        >
          ✏️ Editar
        </button>
        <button
          class="w-full text-left px-3 py-1.5 text-[12px] text-red-400 hover:bg-[#2d2f52] transition-colors"
          @click="onDelete"
        >
          🗑️ Excluir
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collections/components/ItemCard.vue src/modules/collections/components/ItemRow.vue
git commit -m "feat(collections): ItemCard (portrait 3:4) + ItemRow components"
```

---

## Task 8: CollectionDetailView

**Files:**
- Create: `src/modules/collections/views/CollectionDetailView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Criar `src/modules/collections/views/CollectionDetailView.vue`**

Banner de capa 120px com overlay gradient + nome + stats + botões de alternância view + botão "+ Item". Toggle grade/lista salvo em localStorage. Grade 4 col desktop → 3 tablet → 2 mobile. Modal de criação/edição de item via `ItemForm`.

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCollectionsStore } from '../composables/useCollections'
import { useItemsStore } from '../composables/useItems'
import ItemCard from '../components/ItemCard.vue'
import ItemRow from '../components/ItemRow.vue'
import ItemForm from '../components/ItemForm.vue'
import CollectionForm from '../components/CollectionForm.vue'
import AppModal from '@/shared/ui/AppModal.vue'

const route = useRoute()
const router = useRouter()
const collectionsStore = useCollectionsStore()
const itemsStore = useItemsStore()

const collectionId = computed(() => route.params.id as string)

// View mode: grid | list — persisted in localStorage
const VIEW_MODE_KEY = 'collections:viewMode'
const viewMode = ref<'grid' | 'list'>(
  (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') ?? 'grid',
)

function setViewMode(mode: 'grid' | 'list') {
  viewMode.value = mode
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

const showItemModal = ref(false)
const showEditCollectionModal = ref(false)
const editingItem = ref<null | (typeof itemsStore.items)[0]>(null)

onMounted(async () => {
  await collectionsStore.fetchCollection(collectionId.value)
  await itemsStore.fetchItems(collectionId.value)
})

const collection = computed(() => collectionsStore.current)

function openCreateItem() {
  editingItem.value = null
  showItemModal.value = true
}

function openEditItem(item: (typeof itemsStore.items)[0]) {
  editingItem.value = item
  showItemModal.value = true
}

function closeItemModal() {
  showItemModal.value = false
  editingItem.value = null
}

async function handleDeleteItem(itemId: string) {
  if (!confirm('Excluir este item?')) return
  await itemsStore.deleteItem(collectionId.value, itemId)
}

function goToItem(itemId: string) {
  router.push(`/collections/${collectionId.value}/items/${itemId}`)
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <!-- Loading -->
    <div v-if="collectionsStore.loading && !collection" class="p-4">
      <div class="h-[120px] bg-[#1e2038] rounded-[10px] animate-pulse mb-4" />
    </div>

    <template v-else-if="collection">
      <!-- Banner / cover area -->
      <div class="relative h-[120px] overflow-hidden">
        <img
          v-if="collection.coverUrl"
          :src="collection.coverUrl"
          :alt="collection.name"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full bg-gradient-to-br from-violet-900 to-indigo-900"
        />

        <!-- Gradient overlay for text legibility -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <!-- Content over banner -->
        <div class="absolute inset-x-0 bottom-0 px-4 pb-3 flex items-end justify-between">
          <div>
            <h1 class="text-[18px] font-bold text-white drop-shadow leading-tight">
              {{ collection.name }}
            </h1>
            <p class="text-[11px] text-white/70">
              {{ collection.itemCount }} {{ collection.itemCount === 1 ? 'item' : 'itens' }}
              · {{ collection.isPublic ? 'Pública' : 'Privada' }}
            </p>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-2">
            <!-- Edit collection -->
            <button
              class="w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              title="Editar coleção"
              @click="showEditCollectionModal = true"
            >
              ✏️
            </button>
            <!-- Grid toggle -->
            <button
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors',
                viewMode === 'grid' ? 'bg-[#f59e0b] text-black' : 'bg-black/50 hover:bg-black/70 text-white/80',
              ]"
              title="Grade"
              @click="setViewMode('grid')"
            >
              ⊞
            </button>
            <!-- List toggle -->
            <button
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors',
                viewMode === 'list' ? 'bg-[#f59e0b] text-black' : 'bg-black/50 hover:bg-black/70 text-white/80',
              ]"
              title="Lista"
              @click="setViewMode('list')"
            >
              ≡
            </button>
            <!-- Add item -->
            <button
              class="hidden md:flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black text-[12px] font-semibold px-3 py-1.5 rounded-[6px] transition-colors"
              @click="openCreateItem"
            >
              + Item
            </button>
          </div>
        </div>
      </div>

      <!-- Items content -->
      <div class="p-4">
        <!-- Loading items -->
        <div
          v-if="itemsStore.loading && itemsStore.items.length === 0"
          :class="viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'space-y-2'"
        >
          <div
            v-for="n in 8"
            :key="n"
            :class="[
              'bg-[#1e2038] rounded-[8px] animate-pulse border border-[#252640]',
              viewMode === 'grid' ? 'aspect-[3/4]' : 'h-[90px]',
            ]"
          />
        </div>

        <!-- Empty state -->
        <div
          v-else-if="itemsStore.items.length === 0"
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <span class="text-5xl mb-4 opacity-50">📦</span>
          <p class="text-[14px] font-medium text-[#94a3b8]">Nenhum item ainda</p>
          <p class="text-[12px] text-[#475569] mt-1 mb-4">Adicione o primeiro item a esta coleção</p>
          <button
            class="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[13px] font-semibold px-4 py-2 rounded-[6px] transition-colors"
            @click="openCreateItem"
          >
            + Adicionar item
          </button>
        </div>

        <!-- Grid view -->
        <div
          v-else-if="viewMode === 'grid'"
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          <ItemCard
            v-for="item in itemsStore.items"
            :key="item.id"
            :item="item"
            @click="goToItem"
          />
        </div>

        <!-- List view -->
        <div v-else class="space-y-2">
          <ItemRow
            v-for="item in itemsStore.items"
            :key="item.id"
            :item="item"
            @click="goToItem"
            @edit="openEditItem"
            @delete="handleDeleteItem"
          />
        </div>
      </div>
    </template>

    <!-- Floating add button (mobile) -->
    <button
      class="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#f59e0b] hover:bg-[#d97706] text-black text-2xl rounded-full shadow-lg flex items-center justify-center transition-colors"
      @click="openCreateItem"
    >
      +
    </button>

    <!-- Item create/edit modal -->
    <AppModal v-if="showItemModal" @close="closeItemModal">
      <ItemForm
        :collection-id="collectionId"
        :item="editingItem ?? undefined"
        @close="closeItemModal"
      />
    </AppModal>

    <!-- Edit collection modal -->
    <AppModal v-if="showEditCollectionModal" @close="showEditCollectionModal = false">
      <CollectionForm
        :collection="collection ?? undefined"
        @close="showEditCollectionModal = false"
      />
    </AppModal>
  </div>
</template>
```

- [ ] **Step 2: Adicionar rota `/collections/:id` no router**

```typescript
{
  path: '/collections/:id',
  name: 'CollectionDetail',
  component: () => import('@/modules/collections/views/CollectionDetailView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collections/views/CollectionDetailView.vue src/router/index.ts
git commit -m "feat(collections): CollectionDetailView com banner, grade/lista e floating button"
```

---

## Task 9: ItemForm (modal)

**Files:**
- Create: `src/modules/collections/components/ItemForm.vue`

- [ ] **Step 1: Criar `src/modules/collections/components/ItemForm.vue`**

Formulário de criação/edição de item: nome (obrigatório), upload de capa com preview, avaliação em estrelas interativas (1-5), notas (textarea). Campos customizados da coleção renderizados dinamicamente se existirem. Suporta modo create e edit.

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useItemsStore } from '../composables/useItems'
import { listFieldDefinitions } from '../services/collectionsService'
import type { Item, FieldDefinition } from '../types'

const props = defineProps<{
  collectionId: string
  item?: Item   // modo edição
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useItemsStore()

const isEditMode = computed(() => !!props.item)

// Form fields
const name = ref(props.item?.name ?? '')
const notes = ref(props.item?.notes ?? '')
const rating = ref<number>(props.item?.rating ?? 0)
const customFields = ref<Record<string, string | number | boolean>>(
  props.item?.customFields ? { ...props.item.customFields } : {},
)

// Cover upload
const coverPreviewUrl = ref<string | null>(props.item?.coverUrl ?? null)
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Field definitions (custom fields)
const fieldDefinitions = ref<FieldDefinition[]>([])

const submitting = ref(false)
const fieldError = ref('')

onMounted(async () => {
  try {
    fieldDefinitions.value = await listFieldDefinitions()
  } catch {
    // non-critical, ignore
  }
})

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  selectedFile.value = file
  coverPreviewUrl.value = URL.createObjectURL(file)
}

function setRating(value: number) {
  rating.value = rating.value === value ? 0 : value
}

async function submit() {
  if (!name.value.trim()) {
    fieldError.value = 'O nome é obrigatório'
    return
  }
  fieldError.value = ''
  submitting.value = true

  const payload = {
    name: name.value.trim(),
    notes: notes.value.trim() || undefined,
    rating: rating.value || undefined,
    customFields: Object.keys(customFields.value).length ? customFields.value : undefined,
    isPublic: false,
  }

  if (isEditMode.value && props.item) {
    const ok = await store.updateItem(props.collectionId, props.item.id, payload)
    // Upload cover if a new file was selected
    if (ok && selectedFile.value) {
      await store.uploadItemCover(props.collectionId, props.item.id, selectedFile.value)
    }
  } else {
    const created = await store.createItem(props.collectionId, payload)
    // Upload cover to new item
    if (created && selectedFile.value) {
      await store.uploadItemCover(props.collectionId, created.id, selectedFile.value)
    }
  }

  submitting.value = false
  if (!store.error) emit('close')
}
</script>

<template>
  <div class="p-5 max-h-[85vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-[16px] font-bold text-[#e2e8f0]">
        {{ isEditMode ? 'Editar item' : 'Novo item' }}
      </h2>
      <button
        class="w-7 h-7 rounded-full hover:bg-[#252640] flex items-center justify-center text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <!-- Cover upload -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Capa
        </label>
        <div class="flex gap-3 items-start">
          <!-- Preview box -->
          <div
            class="flex-shrink-0 w-[72px] h-[96px] bg-[#252640] rounded-[6px] overflow-hidden border border-[#333355] cursor-pointer hover:border-[#f59e0b]/50 transition-colors"
            @click="openFilePicker"
          >
            <img
              v-if="coverPreviewUrl"
              :src="coverPreviewUrl"
              alt="Preview"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1">
              <span class="text-xl text-[#475569]">📷</span>
              <span class="text-[9px] text-[#475569]">Capa</span>
            </div>
          </div>
          <div class="flex-1 pt-1">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileSelected"
            />
            <button
              type="button"
              class="text-[12px] text-[#94a3b8] hover:text-[#f59e0b] underline underline-offset-2 transition-colors"
              @click="openFilePicker"
            >
              {{ coverPreviewUrl ? 'Trocar imagem' : 'Escolher imagem' }}
            </button>
            <p class="text-[10px] text-[#475569] mt-1">JPEG ou PNG, max 5MB</p>
          </div>
        </div>
      </div>

      <!-- Name -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Nome *
        </label>
        <input
          v-model="name"
          type="text"
          placeholder="Ex: The Last of Us Part II"
          maxlength="200"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors"
        />
        <p v-if="fieldError" class="text-[11px] text-red-400 mt-1">{{ fieldError }}</p>
      </div>

      <!-- Rating (interactive stars) -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Avaliação
        </label>
        <div class="flex gap-2 items-center">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="text-2xl transition-transform hover:scale-110 focus:outline-none"
            :class="n <= rating ? 'text-[#f59e0b]' : 'text-[#475569]'"
            @click="setRating(n)"
          >
            ★
          </button>
          <span class="text-[11px] text-[#475569] ml-1">
            {{ rating === 0 ? 'Sem nota' : `${rating}/5` }}
          </span>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <label class="block text-[11px] font-medium text-[#94a3b8] mb-1 uppercase tracking-wider">
          Notas
        </label>
        <textarea
          v-model="notes"
          placeholder="Impressões, resenha, lembrete..."
          rows="3"
          class="w-full bg-[#252640] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors resize-none"
        />
      </div>

      <!-- Custom fields (dynamic) -->
      <template v-if="fieldDefinitions.length">
        <div class="border-t border-[#252640] pt-3">
          <p class="text-[11px] font-medium text-[#94a3b8] mb-3 uppercase tracking-wider">
            Campos customizados
          </p>
          <div
            v-for="field in fieldDefinitions"
            :key="field.id"
            class="mb-3"
          >
            <label class="block text-[11px] text-[#94a3b8] mb-1">{{ field.name }}</label>
            <!-- Text / number / date -->
            <input
              v-if="field.type === 'text' || field.type === 'number' || field.type === 'date'"
              v-model="customFields[field.id]"
              :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'"
              class="w-full bg-[#252640] border border-[#252640] focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors"
            />
            <!-- Boolean -->
            <button
              v-else-if="field.type === 'boolean'"
              type="button"
              :class="[
                'relative w-11 h-6 rounded-full transition-colors duration-200',
                customFields[field.id] ? 'bg-[#22c55e]' : 'bg-[#252640]',
              ]"
              @click="customFields[field.id] = !customFields[field.id]"
            >
              <span
                :class="[
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                  customFields[field.id] ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
            <!-- Select -->
            <select
              v-else-if="field.type === 'select'"
              v-model="customFields[field.id]"
              class="w-full bg-[#252640] border border-[#252640] focus:border-[#f59e0b] text-[#e2e8f0] text-[13px] px-3 py-2 rounded-[6px] outline-none transition-colors cursor-pointer"
            >
              <option value="">Selecione...</option>
              <option
                v-for="opt in field.selectOptions"
                :key="opt"
                :value="opt"
              >
                {{ opt }}
              </option>
            </select>
          </div>
        </div>
      </template>

      <!-- Server error -->
      <p v-if="store.error" class="text-[12px] text-red-400">{{ store.error }}</p>

      <!-- Actions -->
      <div class="flex gap-3 pt-1">
        <button
          type="button"
          class="flex-1 bg-[#252640] hover:bg-[#2d2f52] text-[#94a3b8] text-[13px] font-medium py-2 rounded-[6px] transition-colors"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="submitting"
          class="flex-1 bg-[#f59e0b] hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed text-black text-[13px] font-semibold py-2 rounded-[6px] transition-colors"
        >
          {{ submitting ? 'Salvando...' : isEditMode ? 'Salvar' : 'Adicionar' }}
        </button>
      </div>
    </form>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/collections/components/ItemForm.vue
git commit -m "feat(collections): ItemForm com upload de capa, estrelas interativas e campos customizados"
```

---

## Task 10: ItemDetailView

**Files:**
- Create: `src/modules/collections/views/ItemDetailView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Criar `src/modules/collections/views/ItemDetailView.vue`**

Detalhe do item. Layout 2 colunas (desktop): capa grande 3:4 à esquerda + info à direita. Mobile: capa + info empilhados. Campos customizados renderizados como pares chave/valor. Botões editar/deletar exibidos (sub-projeto 3 adicionará guarda por ownership).

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../composables/useItems'
import { useCollectionsStore } from '../composables/useCollections'
import ItemForm from '../components/ItemForm.vue'
import AppModal from '@/shared/ui/AppModal.vue'

const route = useRoute()
const router = useRouter()

const collectionsStore = useCollectionsStore()
const itemsStore = useItemsStore()

const collectionId = computed(() => route.params.id as string)
const itemId = computed(() => route.params.itemId as string)

const showEditModal = ref(false)

onMounted(async () => {
  await itemsStore.fetchItem(collectionId.value, itemId.value)
  await collectionsStore.fetchCollection(collectionId.value)
})

const item = computed(() => itemsStore.current)
const collection = computed(() => collectionsStore.current)

const stars = computed(() => {
  const rating = item.value?.rating ?? 0
  return Array.from({ length: 5 }, (_, i) => i < rating)
})

const isPlatinum = computed(() => item.value?.rating === 5)

const customFieldEntries = computed(() => {
  if (!item.value?.customFields) return []
  return Object.entries(item.value.customFields).map(([key, value]) => ({ key, value }))
})

async function handleDelete() {
  if (!item.value) return
  if (!confirm('Excluir este item permanentemente?')) return
  const ok = await itemsStore.deleteItem(collectionId.value, item.value.id)
  if (ok) router.push(`/collections/${collectionId.value}`)
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a] p-4">
    <!-- Back button -->
    <button
      class="flex items-center gap-2 text-[12px] text-[#94a3b8] hover:text-[#e2e8f0] transition-colors mb-4"
      @click="router.push(`/collections/${collectionId}`)"
    >
      ← {{ collection?.name ?? 'Coleção' }}
    </button>

    <!-- Loading -->
    <div v-if="itemsStore.loading && !item" class="md:flex gap-6">
      <div class="w-full md:w-[220px] flex-shrink-0 aspect-[3/4] bg-[#1e2038] rounded-[10px] animate-pulse" />
      <div class="flex-1 mt-4 md:mt-0 space-y-3">
        <div class="h-6 bg-[#1e2038] rounded animate-pulse w-2/3" />
        <div class="h-4 bg-[#1e2038] rounded animate-pulse w-1/4" />
        <div class="h-16 bg-[#1e2038] rounded animate-pulse" />
      </div>
    </div>

    <template v-else-if="item">
      <div class="md:flex gap-6">
        <!-- Cover: 3:4 aspect ratio -->
        <div class="flex-shrink-0 w-full md:w-[200px]">
          <div class="relative rounded-[10px] overflow-hidden bg-[#1e2038] border border-[#252640]" style="aspect-ratio: 3/4">
            <img
              v-if="item.coverUrl"
              :src="item.coverUrl"
              :alt="item.name"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <span class="text-6xl text-[#475569]">🖼️</span>
            </div>
            <!-- Platinum badge -->
            <div v-if="isPlatinum" class="absolute top-3 right-3">
              <span class="text-2xl drop-shadow-lg" title="Platinado">🏆</span>
            </div>
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 mt-4 md:mt-0">
          <!-- Title -->
          <h1 class="text-[22px] font-bold text-[#e2e8f0] leading-tight">{{ item.name }}</h1>

          <!-- Stars -->
          <div v-if="item.rating" class="flex items-center gap-1 mt-2">
            <span
              v-for="(filled, i) in stars"
              :key="i"
              :class="filled ? 'text-[#f59e0b]' : 'text-[#475569]'"
              class="text-xl"
            >★</span>
            <span class="text-[12px] text-[#94a3b8] ml-2">{{ item.rating }}/5</span>
          </div>
          <p v-else class="text-[12px] text-[#475569] mt-2">Sem avaliação</p>

          <!-- Notes -->
          <div v-if="item.notes" class="mt-4">
            <p class="text-[11px] font-medium text-[#94a3b8] uppercase tracking-wider mb-1">Notas</p>
            <p class="text-[13px] text-[#e2e8f0] leading-relaxed whitespace-pre-wrap">{{ item.notes }}</p>
          </div>

          <!-- Custom fields -->
          <div v-if="customFieldEntries.length" class="mt-4">
            <p class="text-[11px] font-medium text-[#94a3b8] uppercase tracking-wider mb-2">Detalhes</p>
            <div class="space-y-1.5">
              <div
                v-for="field in customFieldEntries"
                :key="field.key"
                class="flex gap-2"
              >
                <span class="text-[12px] text-[#475569] min-w-[100px]">{{ field.key }}</span>
                <span class="text-[12px] text-[#e2e8f0]">
                  {{ typeof field.value === 'boolean' ? (field.value ? 'Sim' : 'Não') : field.value }}
                </span>
              </div>
            </div>
          </div>

          <!-- Meta -->
          <div class="mt-4 pt-4 border-t border-[#252640]">
            <p class="text-[11px] text-[#475569]">
              Adicionado em {{ new Date(item.createdAt).toLocaleDateString('pt-BR') }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 mt-4">
            <button
              class="bg-[#252640] hover:bg-[#2d2f52] text-[#94a3b8] hover:text-[#e2e8f0] text-[13px] font-medium px-4 py-2 rounded-[6px] transition-colors"
              @click="showEditModal = true"
            >
              ✏️ Editar
            </button>
            <button
              class="bg-red-900/20 hover:bg-red-900/40 text-red-400 text-[13px] font-medium px-4 py-2 rounded-[6px] transition-colors border border-red-500/20"
              @click="handleDelete"
            >
              🗑️ Excluir
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit modal -->
    <AppModal v-if="showEditModal && item" @close="showEditModal = false">
      <ItemForm
        :collection-id="collectionId"
        :item="item"
        @close="showEditModal = false"
      />
    </AppModal>
  </div>
</template>
```

- [ ] **Step 2: Adicionar rota `/collections/:id/items/:itemId` no router**

```typescript
{
  path: '/collections/:id/items/:itemId',
  name: 'ItemDetail',
  component: () => import('@/modules/collections/views/ItemDetailView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/collections/views/ItemDetailView.vue src/router/index.ts
git commit -m "feat(collections): ItemDetailView com layout 3:4, campos dinâmicos, editar/excluir"
```

---

## Verificação Final

Após concluir todas as tasks, verificar:

- [ ] `npm run build` (ou `vite build`) sem erros de TypeScript
- [ ] Navegar para `/collections` — grid de coleções renderiza
- [ ] Criar nova coleção via modal — card aparece no grid
- [ ] Clicar num card — redireciona para `/collections/:id` com banner e grade vazia
- [ ] Adicionar item — card portrait aparece na grade
- [ ] Toggle ⊞/≡ — alterna entre grade e lista; preferência persiste no reload
- [ ] Clicar num item — redireciona para `/collections/:id/items/:itemId`
- [ ] Upload de capa na coleção — botão 📷 aparece no hover, imagem atualiza
- [ ] Upload de capa no item (via ItemForm) — preview aparece antes de salvar
- [ ] Avaliação em estrelas — clique define rating; clique na mesma estrela zera
- [ ] Badge pública/privada renderiza corretamente
- [ ] Badge 🏆 aparece apenas para rating === 5
- [ ] `npm run type-check` (se configurado) — zero erros
