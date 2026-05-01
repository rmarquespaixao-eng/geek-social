// src/modules/communities/stores/communitiesStore.ts
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { communitiesApi } from '../services/communitiesApi'
import type {
  CommunitySummary,
  CommunityDetail,
  CommunityCategory,
  CommunityVisibility,
  CreateCommunityPayload,
  UpdateCommunityPayload,
} from '../types'

export const useCommunitiesStore = defineStore('communities', () => {
  // Detail cache keyed by id — preserves referential identity so reactive views
  // don't re-render needlessly when the same detail is fetched multiple times.
  const byId = reactive(new Map<string, CommunityDetail>())
  // Slug → id index so slug-based routes can resolve to cached detail.
  const bySlug = reactive(new Map<string, string>())

  // Discover list
  const discoverCommunities = ref<CommunitySummary[]>([])
  const discoverNextCursor = ref<string | null>(null)
  const discoverLoading = ref(false)

  // Owned list
  const ownedCommunities = ref<CommunitySummary[]>([])
  const ownedNextCursor = ref<string | null>(null)
  const ownedLoading = ref(false)

  // Joined list
  const joinedCommunities = ref<CommunitySummary[]>([])
  const joinedNextCursor = ref<string | null>(null)
  const joinedLoading = ref(false)

  // ========== Cache helpers ==========

  function setCached(detail: CommunityDetail) {
    byId.set(detail.community.id, detail)
    bySlug.set(detail.community.slug, detail.community.id)
  }

  function getCached(idOrSlug: string): CommunityDetail | undefined {
    // Try direct id lookup first, then resolve slug.
    if (byId.has(idOrSlug)) return byId.get(idOrSlug)
    const id = bySlug.get(idOrSlug)
    return id ? byId.get(id) : undefined
  }

  function evict(id: string) {
    const detail = byId.get(id)
    if (detail) bySlug.delete(detail.community.slug)
    byId.delete(id)
  }

  function patchSummaryInLists(summary: CommunitySummary) {
    for (const list of [discoverCommunities.value, ownedCommunities.value, joinedCommunities.value]) {
      const idx = list.findIndex(c => c.id === summary.id)
      if (idx !== -1) list[idx] = summary
    }
    const cached = byId.get(summary.id)
    if (cached) cached.community = summary
  }

  // ========== Fetch actions ==========

  async function fetchList(
    scope: 'discover' | 'owned' | 'joined',
    filters: {
      category?: CommunityCategory | null
      visibility?: CommunityVisibility | null
      search?: string | null
      cursor?: string | null
      limit?: number
    } = {},
    append = false,
  ) {
    if (scope === 'discover') {
      if (discoverLoading.value) return
      discoverLoading.value = true
      try {
        const page = await communitiesApi.listCommunities(filters)
        discoverCommunities.value = append
          ? [...discoverCommunities.value, ...page.communities]
          : page.communities
        discoverNextCursor.value = page.nextCursor
      } finally {
        discoverLoading.value = false
      }
    } else if (scope === 'owned') {
      if (ownedLoading.value) return
      ownedLoading.value = true
      try {
        const page = await communitiesApi.listOwned(filters)
        ownedCommunities.value = append
          ? [...ownedCommunities.value, ...page.communities]
          : page.communities
        ownedNextCursor.value = page.nextCursor
      } finally {
        ownedLoading.value = false
      }
    } else {
      if (joinedLoading.value) return
      joinedLoading.value = true
      try {
        const page = await communitiesApi.listJoined(filters)
        joinedCommunities.value = append
          ? [...joinedCommunities.value, ...page.communities]
          : page.communities
        joinedNextCursor.value = page.nextCursor
      } finally {
        joinedLoading.value = false
      }
    }
  }

  async function fetchDetail(idOrSlug: string, force = false): Promise<CommunityDetail> {
    if (!force) {
      const cached = getCached(idOrSlug)
      if (cached) return cached
    }
    const detail = await communitiesApi.getCommunity(idOrSlug)
    setCached(detail)
    return detail
  }

  // ========== Mutations ==========

  async function create(
    payload: CreateCommunityPayload,
    cover: File,
    icon: File,
  ): Promise<CommunitySummary> {
    const summary = await communitiesApi.createCommunity(payload, cover, icon)
    // Invalidate owned list so next access reflects new community.
    ownedCommunities.value = []
    ownedNextCursor.value = null
    return summary
  }

  async function update(
    id: string,
    payload: UpdateCommunityPayload,
    cover?: File | null,
    icon?: File | null,
  ): Promise<CommunitySummary> {
    const summary = await communitiesApi.updateCommunity(id, payload, cover, icon)
    patchSummaryInLists(summary)
    return summary
  }

  async function softDelete(id: string): Promise<void> {
    await communitiesApi.softDeleteCommunity(id)
    evict(id)
    for (const list of [discoverCommunities, ownedCommunities, joinedCommunities]) {
      list.value = list.value.filter(c => c.id !== id)
    }
  }

  async function join(id: string) {
    const result = await communitiesApi.joinCommunity(id)
    const cached = byId.get(id)
    if (cached) {
      if (result.membership) {
        cached.viewerMembership = {
          role: result.membership.role,
          status: result.membership.status,
          joinedAt: result.membership.joinedAt,
        }
        if (result.status === 'active') {
          cached.community.memberCount += 1
        }
      } else if (result.status === 'pending' && result.request) {
        cached.viewerMembership = {
          role: 'member',
          status: 'pending',
          joinedAt: result.request.createdAt,
        }
      }
    }
    return result
  }

  async function leave(id: string): Promise<void> {
    await communitiesApi.leaveCommunity(id)
    const cached = byId.get(id)
    if (cached) {
      cached.viewerMembership = null
      cached.community.memberCount = Math.max(0, cached.community.memberCount - 1)
    }
    joinedCommunities.value = joinedCommunities.value.filter(c => c.id !== id)
  }

  return {
    byId,
    bySlug,
    discoverCommunities,
    discoverNextCursor,
    discoverLoading,
    ownedCommunities,
    ownedNextCursor,
    ownedLoading,
    joinedCommunities,
    joinedNextCursor,
    joinedLoading,
    getCached,
    setCached,
    evict,
    fetchList,
    fetchDetail,
    create,
    update,
    softDelete,
    join,
    leave,
  }
})
