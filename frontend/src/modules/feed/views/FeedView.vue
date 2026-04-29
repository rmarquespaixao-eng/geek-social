<!-- src/modules/feed/views/FeedView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Home } from 'lucide-vue-next'
import PostCard from '../components/PostCard.vue'
import FeedSidebar from '../components/FeedSidebar.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
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
    <AppPageHeader :icon="Home" title="Feed">
      <template #subtitle>
        <span class="font-semibold text-[#cbd5e1]">{{ feed.posts.length }}</span>
        <span>{{ feed.posts.length === 1 ? 'postagem' : 'postagens' }}</span>
      </template>
    </AppPageHeader>

    <div class="max-w-5xl mx-auto px-4 py-6 flex gap-6">
      <!-- Coluna principal -->
      <main class="flex-1 min-w-0 space-y-4">

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
          <p class="text-slate-500 text-sm">Adicione amigos para ver as postagens deles aqui.</p>
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
