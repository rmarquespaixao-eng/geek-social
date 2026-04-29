# Frontend — Sub-projeto 4: Feed e Interações

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o Feed global com infinite scroll, criação/edição/remoção de posts com mídia, reações com toggle otimístico, comentários inline e painel lateral de contexto social.

**Architecture:** Módulo `src/modules/feed/` com services por responsabilidade (feed, posts, comments, reactions), store Pinia `useFeed` para estado global do feed, composable `usePost` para operações isoladas em post individual. O `FeedView` usa `IntersectionObserver` nativo para infinite scroll cursor-based. Atualizações otimísticas nas reações mantêm a UI responsiva sem aguardar resposta da API.

**Tech Stack:** Vue 3 + TypeScript, Tailwind CSS v4, Pinia, Axios

**Pré-requisito:** Sub-projetos 1, 2 e 3 completos.

---

## Estrutura de Arquivos

**Criar:**
```
src/modules/feed/types.ts
src/modules/feed/services/feedService.ts
src/modules/feed/services/postsService.ts
src/modules/feed/services/commentsService.ts
src/modules/feed/services/reactionsService.ts
src/modules/feed/composables/useFeed.ts
src/modules/feed/composables/usePost.ts
src/modules/feed/components/ReactionButton.vue
src/modules/feed/components/CommentItem.vue
src/modules/feed/components/CommentSection.vue
src/modules/feed/components/PostCard.vue
src/modules/feed/components/PostComposer.vue
src/modules/feed/components/FeedSidebar.vue
src/modules/feed/views/FeedView.vue
```

**Modificar:**
```
src/router/index.ts          — adicionar rota /feed e redirect / → /feed
src/modules/users/views/ProfileView.vue  — aba "Feed" com posts do perfil
```

---

## Task 1: Types + Services

**Files:**
- Create: `src/modules/feed/types.ts`
- Create: `src/modules/feed/services/feedService.ts`
- Create: `src/modules/feed/services/postsService.ts`
- Create: `src/modules/feed/services/commentsService.ts`
- Create: `src/modules/feed/services/reactionsService.ts`

- [ ] **Step 1: Criar types.ts**

```typescript
// src/modules/feed/types.ts

export interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video'
}

export interface Reaction {
  type: string
  count: number
  userReacted: boolean
}

export interface Post {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string
  media: MediaItem[]
  reactionCount: number
  commentCount: number
  userReaction: string | null
  visibility: 'public' | 'friends_only' | 'private'
  createdAt: string
}

export interface Comment {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string
  createdAt: string
}

export interface FeedPage {
  posts: Post[]
  nextCursor: string | null
}

export interface CommentsPage {
  comments: Comment[]
  nextCursor: string | null
}
```

- [ ] **Step 2: Criar feedService.ts**

```typescript
// src/modules/feed/services/feedService.ts
import api from '@/shared/http/api'
import type { FeedPage } from '../types'

export const feedService = {
  async getFeed(cursor?: string | null, limit = 20): Promise<FeedPage> {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    const { data } = await api.get<FeedPage>('/feed', { params })
    return data
  },
}
```

- [ ] **Step 3: Criar postsService.ts**

```typescript
// src/modules/feed/services/postsService.ts
import api from '@/shared/http/api'
import type { Post } from '../types'

export interface CreatePostData {
  content: string
  visibility?: 'public' | 'friends_only' | 'private'
}

export interface UpdatePostData {
  content?: string
}

export const postsService = {
  async createPost(data: CreatePostData): Promise<Post> {
    const { data: post } = await api.post<Post>('/posts', data)
    return post
  },

  async getPost(id: string): Promise<Post> {
    const { data } = await api.get<Post>(`/posts/${id}`)
    return data
  },

  async updatePost(id: string, data: UpdatePostData): Promise<Post> {
    const { data: post } = await api.patch<Post>(`/posts/${id}`, data)
    return post
  },

  async deletePost(id: string): Promise<void> {
    await api.delete(`/posts/${id}`)
  },

  async addMedia(id: string, file: File): Promise<Post> {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post<Post>(`/posts/${id}/media`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  async removeMedia(id: string, mediaId: string): Promise<void> {
    await api.delete(`/posts/${id}/media/${mediaId}`)
  },

  async getUserPosts(userId: string, cursor?: string | null, limit = 20): Promise<{ posts: Post[]; nextCursor: string | null }> {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    const { data } = await api.get(`/users/${userId}/posts`, { params })
    return data
  },
}
```

- [ ] **Step 4: Criar commentsService.ts**

```typescript
// src/modules/feed/services/commentsService.ts
import api from '@/shared/http/api'
import type { CommentsPage, Comment } from '../types'

export const commentsService = {
  async addComment(postId: string, content: string): Promise<Comment> {
    const { data } = await api.post<Comment>(`/posts/${postId}/comments`, { content })
    return data
  },

  async listComments(postId: string, cursor?: string | null, limit = 20): Promise<CommentsPage> {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    const { data } = await api.get<CommentsPage>(`/posts/${postId}/comments`, { params })
    return data
  },

  async updateComment(postId: string, id: string, content: string): Promise<Comment> {
    const { data } = await api.patch<Comment>(`/posts/${postId}/comments/${id}`, { content })
    return data
  },

  async deleteComment(postId: string, id: string): Promise<void> {
    await api.delete(`/posts/${postId}/comments/${id}`)
  },
}
```

- [ ] **Step 5: Criar reactionsService.ts**

```typescript
// src/modules/feed/services/reactionsService.ts
import api from '@/shared/http/api'
import type { Reaction } from '../types'

export const reactionsService = {
  async react(postId: string, type: string): Promise<void> {
    await api.post(`/posts/${postId}/reactions`, { type })
  },

  async removeReaction(postId: string): Promise<void> {
    await api.delete(`/posts/${postId}/reactions`)
  },

  async getReactions(postId: string): Promise<Reaction[]> {
    const { data } = await api.get<Reaction[]>(`/posts/${postId}/reactions`)
    return data
  },
}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/feed/types.ts src/modules/feed/services/
git commit -m "feat(feed): add types and service layer (feed, posts, comments, reactions)"
```

---

## Task 2: useFeed Pinia Store

**Files:**
- Create: `src/modules/feed/composables/useFeed.ts`

- [ ] **Step 1: Criar useFeed.ts**

```typescript
// src/modules/feed/composables/useFeed.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { feedService } from '../services/feedService'
import type { Post } from '../types'

export const useFeed = defineStore('feed', () => {
  const posts = ref<Post[]>([])
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const hasMore = computed(() => nextCursor.value !== null)

  async function fetchFeed() {
    if (loading.value) return
    loading.value = true
    try {
      const page = await feedService.getFeed(null)
      posts.value = page.posts
      nextCursor.value = page.nextCursor
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const page = await feedService.getFeed(nextCursor.value)
      posts.value = [...posts.value, ...page.posts]
      nextCursor.value = page.nextCursor
    } finally {
      loading.value = false
    }
  }

  function prependPost(post: Post) {
    posts.value = [post, ...posts.value]
  }

  function removePost(id: string) {
    posts.value = posts.value.filter(p => p.id !== id)
  }

  function updatePostReaction(postId: string, reacted: boolean) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return
    if (reacted) {
      post.userReaction = 'like'
      post.reactionCount += 1
    } else {
      post.userReaction = null
      post.reactionCount = Math.max(0, post.reactionCount - 1)
    }
  }

  function updatePostInList(updated: Post) {
    const idx = posts.value.findIndex(p => p.id === updated.id)
    if (idx !== -1) posts.value[idx] = updated
  }

  function incrementCommentCount(postId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (post) post.commentCount += 1
  }

  function decrementCommentCount(postId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (post) post.commentCount = Math.max(0, post.commentCount - 1)
  }

  return {
    posts,
    nextCursor,
    loading,
    hasMore,
    fetchFeed,
    loadMore,
    prependPost,
    removePost,
    updatePostReaction,
    updatePostInList,
    incrementCommentCount,
    decrementCommentCount,
  }
})
```

- [ ] **Step 2: Criar usePost.ts (para perfil — estado separado)**

```typescript
// src/modules/feed/composables/usePost.ts
import { ref, computed } from 'vue'
import { postsService } from '../services/postsService'
import type { Post } from '../types'

export function usePost(userId?: string) {
  const posts = ref<Post[]>([])
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const hasMore = computed(() => nextCursor.value !== null)

  async function fetchUserPosts(uid: string) {
    if (loading.value) return
    loading.value = true
    try {
      const page = await postsService.getUserPosts(uid, null)
      posts.value = page.posts
      nextCursor.value = page.nextCursor
    } finally {
      loading.value = false
    }
  }

  async function loadMoreUserPosts(uid: string) {
    if (loading.value || !hasMore.value) return
    loading.value = true
    try {
      const page = await postsService.getUserPosts(uid, nextCursor.value)
      posts.value = [...posts.value, ...page.posts]
      nextCursor.value = page.nextCursor
    } finally {
      loading.value = false
    }
  }

  function removePost(id: string) {
    posts.value = posts.value.filter(p => p.id !== id)
  }

  return {
    posts,
    nextCursor,
    loading,
    hasMore,
    fetchUserPosts,
    loadMoreUserPosts,
    removePost,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/feed/composables/
git commit -m "feat(feed): add useFeed Pinia store and usePost composable"
```

---

## Task 3: ReactionButton

**Files:**
- Create: `src/modules/feed/components/ReactionButton.vue`

- [ ] **Step 1: Criar ReactionButton.vue**

```vue
<!-- src/modules/feed/components/ReactionButton.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { Zap } from 'lucide-vue-next'
import { reactionsService } from '../services/reactionsService'
import { useFeed } from '../composables/useFeed'

const props = defineProps<{
  postId: string
  count: number
  userReacted: boolean
}>()

const feed = useFeed()
const pending = ref(false)

async function toggle() {
  if (pending.value) return
  pending.value = true

  // Optimistic update
  feed.updatePostReaction(props.postId, !props.userReacted)

  try {
    if (props.userReacted) {
      await reactionsService.removeReaction(props.postId)
    } else {
      await reactionsService.react(props.postId, 'like')
    }
  } catch {
    // Rollback on error
    feed.updatePostReaction(props.postId, props.userReacted)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <button
    @click="toggle"
    :disabled="pending"
    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150"
    :class="userReacted
      ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
      : 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/10'"
  >
    <Zap
      :size="16"
      :class="userReacted ? 'fill-amber-400' : ''"
    />
    <span>{{ count }}</span>
  </button>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/components/ReactionButton.vue
git commit -m "feat(feed): add ReactionButton with optimistic toggle"
```

---

## Task 4: CommentItem + CommentSection

**Files:**
- Create: `src/modules/feed/components/CommentItem.vue`
- Create: `src/modules/feed/components/CommentSection.vue`

- [ ] **Step 1: Criar CommentItem.vue**

```vue
<!-- src/modules/feed/components/CommentItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { Pencil, Trash2, Check, X } from 'lucide-vue-next'
import { commentsService } from '../services/commentsService'
import type { Comment } from '../types'

const props = defineProps<{
  postId: string
  comment: Comment
  currentUserId: string
}>()

const emit = defineEmits<{
  deleted: [id: string]
  updated: [comment: Comment]
}>()

const editing = ref(false)
const editContent = ref(props.comment.content)
const saving = ref(false)
const deleting = ref(false)

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} dias`
  return date.toLocaleDateString('pt-BR')
}

async function saveEdit() {
  if (!editContent.value.trim() || saving.value) return
  saving.value = true
  try {
    const updated = await commentsService.updateComment(props.postId, props.comment.id, editContent.value.trim())
    emit('updated', updated)
    editing.value = false
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  try {
    await commentsService.deleteComment(props.postId, props.comment.id)
    emit('deleted', props.comment.id)
  } finally {
    deleting.value = false
  }
}

const isOwn = props.comment.authorId === props.currentUserId
</script>

<template>
  <div class="flex gap-2.5">
    <img
      v-if="comment.authorAvatarUrl"
      :src="comment.authorAvatarUrl"
      :alt="comment.authorName"
      class="w-8 h-8 rounded-full object-cover flex-shrink-0"
    />
    <div
      v-else
      class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-300 flex-shrink-0"
    >
      {{ comment.authorName.charAt(0).toUpperCase() }}
    </div>

    <div class="flex-1 min-w-0">
      <div class="bg-[#252640] rounded-xl px-3 py-2">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="text-sm font-semibold text-slate-200">{{ comment.authorName }}</span>
          <span class="text-xs text-slate-500">{{ timeAgo(comment.createdAt) }}</span>
        </div>

        <template v-if="editing">
          <textarea
            v-model="editContent"
            rows="2"
            class="w-full bg-transparent text-sm text-slate-300 resize-none focus:outline-none"
          />
          <div class="flex gap-2 mt-1">
            <button @click="saveEdit" :disabled="saving" class="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <Check :size="12" /> Salvar
            </button>
            <button @click="editing = false" class="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              <X :size="12" /> Cancelar
            </button>
          </div>
        </template>
        <p v-else class="text-sm text-slate-300 break-words">{{ comment.content }}</p>
      </div>

      <div v-if="isOwn" class="flex gap-3 mt-1 ml-2">
        <button @click="editing = true" class="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
          <Pencil :size="11" /> Editar
        </button>
        <button @click="remove" :disabled="deleting" class="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors">
          <Trash2 :size="11" /> Excluir
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Criar CommentSection.vue**

```vue
<!-- src/modules/feed/components/CommentSection.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Send } from 'lucide-vue-next'
import CommentItem from './CommentItem.vue'
import { commentsService } from '../services/commentsService'
import { useFeed } from '../composables/useFeed'
import type { Comment } from '../types'

const props = defineProps<{
  postId: string
  currentUserId: string
}>()

const feed = useFeed()
const comments = ref<Comment[]>([])
const nextCursor = ref<string | null>(null)
const loadingComments = ref(false)
const newContent = ref('')
const submitting = ref(false)

async function load(cursor?: string | null) {
  if (loadingComments.value) return
  loadingComments.value = true
  try {
    const page = await commentsService.listComments(props.postId, cursor)
    if (cursor) {
      comments.value = [...comments.value, ...page.comments]
    } else {
      comments.value = page.comments
    }
    nextCursor.value = page.nextCursor
  } finally {
    loadingComments.value = false
  }
}

async function loadMore() {
  await load(nextCursor.value)
}

async function submit() {
  if (!newContent.value.trim() || submitting.value) return
  submitting.value = true
  try {
    const comment = await commentsService.addComment(props.postId, newContent.value.trim())
    comments.value = [comment, ...comments.value]
    feed.incrementCommentCount(props.postId)
    newContent.value = ''
  } finally {
    submitting.value = false
  }
}

function onDeleted(id: string) {
  comments.value = comments.value.filter(c => c.id !== id)
  feed.decrementCommentCount(props.postId)
}

function onUpdated(updated: Comment) {
  const idx = comments.value.findIndex(c => c.id === updated.id)
  if (idx !== -1) comments.value[idx] = updated
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-3 pt-2 border-t border-slate-700/50">
    <!-- Input novo comentário -->
    <div class="flex gap-2">
      <textarea
        v-model="newContent"
        placeholder="Escreva um comentário..."
        rows="1"
        @keydown.enter.exact.prevent="submit"
        class="flex-1 bg-[#252640] text-slate-200 placeholder-slate-500 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <button
        @click="submit"
        :disabled="!newContent.trim() || submitting"
        class="self-end px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#0f0f1a] rounded-xl transition-colors"
      >
        <Send :size="16" />
      </button>
    </div>

    <!-- Lista de comentários -->
    <div v-if="loadingComments && comments.length === 0" class="text-center text-sm text-slate-500 py-2">
      Carregando comentários...
    </div>

    <div v-else class="space-y-3">
      <CommentItem
        v-for="comment in comments"
        :key="comment.id"
        :postId="postId"
        :comment="comment"
        :currentUserId="currentUserId"
        @deleted="onDeleted"
        @updated="onUpdated"
      />
    </div>

    <button
      v-if="nextCursor"
      @click="loadMore"
      :disabled="loadingComments"
      class="text-sm text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
    >
      {{ loadingComments ? 'Carregando...' : 'Ver mais comentários' }}
    </button>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/feed/components/CommentItem.vue src/modules/feed/components/CommentSection.vue
git commit -m "feat(feed): add CommentItem and CommentSection with lazy load and inline edit"
```

---

## Task 5: PostCard

**Files:**
- Create: `src/modules/feed/components/PostCard.vue`

- [ ] **Step 1: Criar PostCard.vue**

```vue
<!-- src/modules/feed/components/PostCard.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, Share2, MoreHorizontal, Pencil, Trash2, X, Check } from 'lucide-vue-next'
import ReactionButton from './ReactionButton.vue'
import CommentSection from './CommentSection.vue'
import { postsService } from '../services/postsService'
import { useFeed } from '../composables/useFeed'
import { useAuthStore } from '@/modules/auth/store/authStore'
import type { Post } from '../types'

const props = defineProps<{
  post: Post
}>()

const router = useRouter()
const feed = useFeed()
const auth = useAuthStore()

const showComments = ref(false)
const showMenu = ref(false)
const editing = ref(false)
const editContent = ref(props.post.content)
const saving = ref(false)
const deleting = ref(false)

const isOwn = props.post.authorId === auth.user?.id

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days} dias`
  return date.toLocaleDateString('pt-BR')
}

async function saveEdit() {
  if (!editContent.value.trim() || saving.value) return
  saving.value = true
  try {
    const updated = await postsService.updatePost(props.post.id, { content: editContent.value.trim() })
    feed.updatePostInList(updated)
    editing.value = false
    showMenu.value = false
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (deleting.value || !confirm('Excluir este post?')) return
  deleting.value = true
  try {
    await postsService.deletePost(props.post.id)
    feed.removePost(props.post.id)
  } finally {
    deleting.value = false
  }
}

function share() {
  navigator.clipboard?.writeText(`${window.location.origin}/posts/${props.post.id}`)
}

function goToProfile() {
  router.push(`/profile/${props.post.authorId}`)
}
</script>

<template>
  <article class="bg-[#1e2038] rounded-2xl p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3 cursor-pointer" @click="goToProfile">
        <img
          v-if="post.authorAvatarUrl"
          :src="post.authorAvatarUrl"
          :alt="post.authorName"
          class="w-10 h-10 rounded-full object-cover"
        />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-300"
        >
          {{ post.authorName.charAt(0).toUpperCase() }}
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-200 hover:text-amber-400 transition-colors">
            {{ post.authorName }}
          </p>
          <p class="text-xs text-slate-500">{{ timeAgo(post.createdAt) }}</p>
        </div>
      </div>

      <!-- Menu próprio post -->
      <div v-if="isOwn" class="relative">
        <button
          @click="showMenu = !showMenu"
          class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
        >
          <MoreHorizontal :size="18" />
        </button>
        <div
          v-if="showMenu"
          class="absolute right-0 top-8 z-10 bg-[#252640] border border-slate-700/50 rounded-xl py-1 shadow-xl min-w-[130px]"
        >
          <button
            @click="editing = true; showMenu = false"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-amber-400 transition-colors"
          >
            <Pencil :size="14" /> Editar
          </button>
          <button
            @click="remove"
            :disabled="deleting"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 :size="14" /> Excluir
          </button>
        </div>
      </div>
    </div>

    <!-- Body -->
    <template v-if="editing">
      <textarea
        v-model="editContent"
        rows="3"
        class="w-full bg-[#252640] text-slate-200 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <div class="flex gap-2">
        <button
          @click="saveEdit"
          :disabled="saving || !editContent.trim()"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#0f0f1a] font-semibold rounded-lg transition-colors"
        >
          <Check :size="14" /> Salvar
        </button>
        <button
          @click="editing = false"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X :size="14" /> Cancelar
        </button>
      </div>
    </template>

    <template v-else>
      <p class="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{{ post.content }}</p>

      <!-- Imagem (primeira mídia) -->
      <img
        v-if="post.media.length > 0"
        :src="post.media[0].url"
        :alt="'Post de ' + post.authorName"
        class="w-full rounded-xl object-cover max-h-80"
      />
    </template>

    <!-- Footer actions -->
    <div class="flex items-center gap-1 pt-1 border-t border-slate-700/30">
      <ReactionButton
        :postId="post.id"
        :count="post.reactionCount"
        :userReacted="post.userReaction !== null"
      />

      <button
        @click="showComments = !showComments"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
      >
        <MessageCircle :size="16" />
        <span>{{ post.commentCount }}</span>
      </button>

      <button
        @click="share"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
      >
        <Share2 :size="16" />
      </button>
    </div>

    <!-- Comentários inline (lazy) -->
    <CommentSection
      v-if="showComments"
      :postId="post.id"
      :currentUserId="auth.user?.id ?? ''"
    />
  </article>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/components/PostCard.vue
git commit -m "feat(feed): add PostCard with inline edit, delete, share and comments toggle"
```

---

## Task 6: PostComposer

**Files:**
- Create: `src/modules/feed/components/PostComposer.vue`

- [ ] **Step 1: Criar PostComposer.vue**

```vue
<!-- src/modules/feed/components/PostComposer.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { ImagePlus, Send, X } from 'lucide-vue-next'
import { postsService } from '../services/postsService'
import { useFeed } from '../composables/useFeed'
import { useAuthStore } from '@/modules/auth/store/authStore'

const feed = useFeed()
const auth = useAuthStore()

const content = ref('')
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const submitting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const canSubmit = computed(() => content.value.trim().length > 0 && !submitting.value)

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function removeImage() {
  selectedFile.value = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    let post = await postsService.createPost({ content: content.value.trim() })
    if (selectedFile.value) {
      post = await postsService.addMedia(post.id, selectedFile.value)
    }
    feed.prependPost(post)
    content.value = ''
    removeImage()
    if (textareaEl.value) textareaEl.value.style.height = 'auto'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bg-[#1e2038] rounded-2xl p-4 space-y-3">
    <div class="flex gap-3">
      <!-- Avatar do usuário -->
      <img
        v-if="auth.user?.avatarUrl"
        :src="auth.user.avatarUrl"
        :alt="auth.user.displayName"
        class="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
      <div
        v-else
        class="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm font-semibold text-amber-400 flex-shrink-0"
      >
        {{ auth.user?.displayName?.charAt(0).toUpperCase() ?? '?' }}
      </div>

      <!-- Textarea expansível -->
      <textarea
        ref="textareaEl"
        v-model="content"
        @input="autoResize"
        placeholder="O que você está jogando hoje? 🎮"
        rows="2"
        class="flex-1 bg-[#252640] text-slate-200 placeholder-slate-500 text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 overflow-hidden min-h-[56px]"
      />
    </div>

    <!-- Preview da imagem selecionada -->
    <div v-if="previewUrl" class="relative ml-13">
      <img :src="previewUrl" class="rounded-xl max-h-48 object-cover" />
      <button
        @click="removeImage"
        class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 rounded-full p-1 text-white transition-colors"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Barra de ações -->
    <div class="flex items-center justify-between ml-13">
      <button
        @click="fileInput?.click()"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
      >
        <ImagePlus :size="16" />
        <span>Foto</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onFileChange"
      />

      <button
        @click="submit"
        :disabled="!canSubmit"
        class="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#0f0f1a] text-sm font-bold rounded-xl transition-colors"
      >
        <Send :size="15" />
        Publicar
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/components/PostComposer.vue
git commit -m "feat(feed): add PostComposer with image preview and auto-resize textarea"
```

---

## Task 7: FeedSidebar

**Files:**
- Create: `src/modules/feed/components/FeedSidebar.vue`

- [ ] **Step 1: Criar FeedSidebar.vue**

```vue
<!-- src/modules/feed/components/FeedSidebar.vue -->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Users, Library } from 'lucide-vue-next'
import { useFriendsStore } from '@/modules/friends/store/friendsStore'
import { useCollectionsStore } from '@/modules/collections/store/collectionsStore'

const router = useRouter()
const friends = useFriendsStore()
const collections = useCollectionsStore()

const onlineFriends = computed(() =>
  friends.friends.filter(f => f.isOnline).slice(0, 5)
)

const topCollections = computed(() =>
  collections.collections.slice(0, 3)
)

onMounted(async () => {
  if (!friends.friends.length) await friends.fetchFriends()
  if (!collections.collections.length) await collections.fetchCollections()
})
</script>

<template>
  <aside class="w-[200px] flex-shrink-0 space-y-4 self-start sticky top-4">
    <!-- Amigos Online -->
    <div class="bg-[#1e2038] rounded-2xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amigos Online</h3>
        <Users :size="14" class="text-slate-500" />
      </div>

      <div v-if="onlineFriends.length === 0" class="text-xs text-slate-500 text-center py-2">
        Nenhum amigo online
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="friend in onlineFriends"
          :key="friend.id"
          class="flex items-center gap-2 cursor-pointer group"
          @click="router.push(`/profile/${friend.id}`)"
        >
          <div class="relative flex-shrink-0">
            <img
              v-if="friend.avatarUrl"
              :src="friend.avatarUrl"
              :alt="friend.displayName"
              class="w-7 h-7 rounded-full object-cover"
            />
            <div
              v-else
              class="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-300"
            >
              {{ friend.displayName.charAt(0).toUpperCase() }}
            </div>
            <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[#1e2038] rounded-full" />
          </div>
          <span class="text-xs text-slate-300 group-hover:text-amber-400 transition-colors truncate">
            {{ friend.displayName }}
          </span>
        </li>
      </ul>

      <button
        @click="router.push('/friends')"
        class="mt-3 text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        Ver todos →
      </button>
    </div>

    <!-- Suas Coleções -->
    <div class="bg-[#1e2038] rounded-2xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Coleções</h3>
        <Library :size="14" class="text-slate-500" />
      </div>

      <div v-if="topCollections.length === 0" class="text-xs text-slate-500 text-center py-2">
        Nenhuma coleção ainda
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="col in topCollections"
          :key="col.id"
          class="flex items-center gap-2 cursor-pointer group"
          @click="router.push(`/collections/${col.id}`)"
        >
          <span class="text-base flex-shrink-0">{{ col.icon ?? '📦' }}</span>
          <div class="min-w-0">
            <p class="text-xs text-slate-300 group-hover:text-amber-400 transition-colors truncate">{{ col.name }}</p>
            <p class="text-xs text-slate-500">{{ col.itemCount ?? 0 }} itens</p>
          </div>
        </li>
      </ul>

      <button
        @click="router.push('/collections')"
        class="mt-3 text-xs text-amber-400 hover:text-amber-300 transition-colors"
      >
        Ver todas →
      </button>
    </div>
  </aside>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/feed/components/FeedSidebar.vue
git commit -m "feat(feed): add FeedSidebar with online friends and top collections"
```

---

## Task 8: FeedView + Infinite Scroll + Router

**Files:**
- Create: `src/modules/feed/views/FeedView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Criar FeedView.vue**

```vue
<!-- src/modules/feed/views/FeedView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import PostComposer from '../components/PostComposer.vue'
import PostCard from '../components/PostCard.vue'
import FeedSidebar from '../components/FeedSidebar.vue'
import { useFeed } from '../composables/useFeed'

const feed = useFeed()
const sentinel = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(async () => {
  await feed.fetchFeed()

  observer = new IntersectionObserver(
    entries => {
      if (entries[0].isIntersecting && feed.hasMore && !feed.loading) {
        feed.loadMore()
      }
    },
    { rootMargin: '200px' }
  )

  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <div class="max-w-5xl mx-auto px-4 py-6 flex gap-6">
      <!-- Coluna principal -->
      <main class="flex-1 min-w-0 space-y-4">
        <PostComposer />

        <!-- Skeleton loading inicial -->
        <template v-if="feed.loading && feed.posts.length === 0">
          <div
            v-for="i in 3"
            :key="i"
            class="bg-[#1e2038] rounded-2xl p-4 space-y-3 animate-pulse"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-slate-700" />
              <div class="space-y-1.5">
                <div class="h-3 w-32 bg-slate-700 rounded" />
                <div class="h-2 w-16 bg-slate-700/60 rounded" />
              </div>
            </div>
            <div class="space-y-2">
              <div class="h-3 w-full bg-slate-700/60 rounded" />
              <div class="h-3 w-4/5 bg-slate-700/60 rounded" />
            </div>
            <div class="h-6 w-24 bg-slate-700/40 rounded" />
          </div>
        </template>

        <!-- Posts -->
        <TransitionGroup
          name="feed-post"
          tag="div"
          class="space-y-4"
        >
          <PostCard
            v-for="post in feed.posts"
            :key="post.id"
            :post="post"
          />
        </TransitionGroup>

        <!-- Sentinel para infinite scroll -->
        <div ref="sentinel" class="h-1" />

        <!-- Loading mais posts -->
        <div v-if="feed.loading && feed.posts.length > 0" class="text-center py-4">
          <div class="inline-block w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>

        <!-- Fim do feed -->
        <div v-if="!feed.hasMore && feed.posts.length > 0" class="text-center text-sm text-slate-500 py-6">
          Você chegou ao fim do feed ✨
        </div>

        <!-- Feed vazio -->
        <div v-if="!feed.loading && feed.posts.length === 0" class="text-center py-12 space-y-2">
          <p class="text-slate-400 text-lg">Seu feed está vazio</p>
          <p class="text-slate-500 text-sm">Adicione amigos ou publique algo para começar!</p>
        </div>
      </main>

      <!-- Sidebar (apenas desktop) -->
      <FeedSidebar class="hidden lg:flex lg:flex-col" />
    </div>
  </div>
</template>

<style scoped>
.feed-post-enter-active {
  transition: all 0.3s ease;
}
.feed-post-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
```

- [ ] **Step 2: Registrar rota no router**

Abrir `src/router/index.ts` e adicionar a rota `/feed` e o redirect de `/`:

```typescript
// Adicionar ao array de routes:
{
  path: '/',
  redirect: '/feed',
},
{
  path: '/feed',
  component: () => import('@/modules/feed/views/FeedView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/feed/views/FeedView.vue src/router/index.ts
git commit -m "feat(feed): add FeedView with infinite scroll via IntersectionObserver and /feed route"
```

---

## Task 9: Profile Feed Integration

**Files:**
- Modify: `src/modules/users/views/ProfileView.vue`

- [ ] **Step 1: Adicionar aba "Feed" no ProfileView**

Localizar a seção de abas no `ProfileView.vue` e adicionar a aba Feed. Importar e usar `usePost`:

```typescript
// Adicionar no <script setup> de ProfileView.vue
import { usePost } from '@/modules/feed/composables/usePost'
import PostCard from '@/modules/feed/components/PostCard.vue'

const route = useRoute()
const profileUserId = computed(() => route.params.id as string)
const postState = usePost()

// Carregar posts ao montar (ou ao trocar de aba)
async function loadProfileFeed() {
  await postState.fetchUserPosts(profileUserId.value)
}

// Adicionar watcher ou chamar no onMounted dependendo da estrutura existente
watch(() => activeTab.value, (tab) => {
  if (tab === 'feed' && postState.posts.value.length === 0) {
    loadProfileFeed()
  }
}, { immediate: true })
```

Adicionar o template da aba:

```vue
<!-- Aba Feed no ProfileView -->
<div v-if="activeTab === 'feed'" class="space-y-4">
  <div v-if="postState.loading.value && postState.posts.value.length === 0" class="text-center py-8 text-slate-500">
    Carregando posts...
  </div>

  <div v-else-if="postState.posts.value.length === 0" class="text-center py-8 text-slate-500">
    Nenhum post ainda.
  </div>

  <template v-else>
    <PostCard
      v-for="post in postState.posts.value"
      :key="post.id"
      :post="post"
    />

    <button
      v-if="postState.hasMore.value"
      @click="postState.loadMoreUserPosts(profileUserId)"
      :disabled="postState.loading.value"
      class="w-full py-3 text-sm text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
    >
      {{ postState.loading.value ? 'Carregando...' : 'Carregar mais' }}
    </button>
  </template>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/users/views/ProfileView.vue
git commit -m "feat(feed): integrate profile feed tab with usePost composable and getUserPosts"
```

---

## Checklist Final

- [ ] `types.ts` exporta `Post`, `Comment`, `Reaction`, `MediaItem`, `FeedPage`, `CommentsPage`
- [ ] Todos os services usam a instância Axios compartilhada (`@/shared/http/api`)
- [ ] `useFeed` store: `fetchFeed`, `loadMore`, `prependPost`, `removePost`, `updatePostReaction`, `updatePostInList`, `incrementCommentCount`, `decrementCommentCount`
- [ ] `ReactionButton` faz toggle otimístico (atualiza store antes da resposta da API, reverte em erro)
- [ ] `CommentSection` é lazy (carrega somente ao expandir)
- [ ] `PostCard` exibe tempo relativo via `timeAgo()` — "agora", "há Xm", "há Xh", "ontem", "há X dias", data completa se >7 dias
- [ ] `PostComposer` limpa o form após publicar e libera a URL do objeto criado via `URL.revokeObjectURL`
- [ ] `FeedSidebar` visível apenas em `lg:` (hidden no mobile)
- [ ] Infinite scroll via `IntersectionObserver` nativo com `rootMargin: '200px'`
- [ ] Skeleton cards mostrados durante o carregamento inicial
- [ ] Rota `/feed` registrada; `/` redireciona para `/feed`
- [ ] Todos os componentes usam `<script setup lang="ts">`
- [ ] Tailwind classes aplicadas diretamente nos templates (sem CSS externo)
- [ ] ProfileView exibe aba "Feed" com posts do perfil via `usePost` (estado separado do feed global)
