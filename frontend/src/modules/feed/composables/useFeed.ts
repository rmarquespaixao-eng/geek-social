// src/modules/feed/composables/useFeed.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { feedService } from '../services/feedService'
import { postsService } from '../services/postsService'
import type { Post } from '../types'

export const useFeed = defineStore('feed', () => {
  // --- Feed (home) ---
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

  function prependProfilePost(post: Post) {
    profilePosts.value = [post, ...profilePosts.value]
  }

  // --- Profile ---
  const profilePosts = ref<Post[]>([])
  const profileNextCursor = ref<string | null>(null)
  const profileLoading = ref(false)
  const profileHasMore = computed(() => profileNextCursor.value !== null)

  async function fetchUserPosts(uid: string) {
    if (profileLoading.value) return
    profileLoading.value = true
    try {
      const page = await postsService.getUserPosts(uid, null)
      profilePosts.value = page.posts
      profileNextCursor.value = page.nextCursor
    } finally {
      profileLoading.value = false
    }
  }

  async function loadMoreUserPosts(uid: string) {
    if (profileLoading.value || !profileHasMore.value) return
    profileLoading.value = true
    try {
      const page = await postsService.getUserPosts(uid, profileNextCursor.value)
      profilePosts.value = [...profilePosts.value, ...page.posts]
      profileNextCursor.value = page.nextCursor
    } finally {
      profileLoading.value = false
    }
  }

  // --- Mutations (apply to both lists) ---
  function removePost(id: string) {
    posts.value = posts.value.filter(p => p.id !== id)
    profilePosts.value = profilePosts.value.filter(p => p.id !== id)
  }

  function updatePostReaction(postId: string, type: string | null) {
    for (const list of [posts.value, profilePosts.value]) {
      const post = list.find(p => p.id === postId)
      if (!post) continue
      const had = post.userReaction !== null
      const will = type !== null
      if (!had && will) post.reactionCount += 1
      else if (had && !will) post.reactionCount = Math.max(0, post.reactionCount - 1)
      post.userReaction = type
    }
  }

  function updatePostInList(updated: Post) {
    for (const list of [posts.value, profilePosts.value]) {
      const idx = list.findIndex(p => p.id === updated.id)
      if (idx !== -1) list[idx] = updated
    }
  }

  function incrementCommentCount(postId: string) {
    for (const list of [posts.value, profilePosts.value]) {
      const post = list.find(p => p.id === postId)
      if (post) post.commentCount += 1
    }
  }

  function decrementCommentCount(postId: string) {
    for (const list of [posts.value, profilePosts.value]) {
      const post = list.find(p => p.id === postId)
      if (post) post.commentCount = Math.max(0, post.commentCount - 1)
    }
  }

  return {
    posts,
    nextCursor,
    loading,
    hasMore,
    fetchFeed,
    loadMore,
    prependPost,
    prependProfilePost,
    profilePosts,
    profileLoading,
    profileHasMore,
    fetchUserPosts,
    loadMoreUserPosts,
    removePost,
    updatePostReaction,
    updatePostInList,
    incrementCommentCount,
    decrementCommentCount,
  }
})
