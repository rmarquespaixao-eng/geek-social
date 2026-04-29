// src/modules/events/stores/eventsStore.ts
import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'
import { eventsApi } from '../services/eventsApi'
import type {
  EventDetail,
  EventListFilters,
  EventNotificationPayload,
  EventSummary,
  SubscribeResponse,
} from '../types'

/**
 * Pinia store for events module.
 *
 * Caches event details by id, lists for discovery and "my events", and exposes
 * action methods that update the cache optimistically.
 *
 * `applyNotification` is called by the global notifications WS listener when an
 * `event_*` notification arrives — it patches/invalidates relevant cache entries.
 */
export const useEventsStore = defineStore('events', () => {
  const cache = reactive(new Map<string, EventDetail>())

  // Discover list
  const discoverEvents = ref<EventSummary[]>([])
  const discoverNextCursor = ref<string | null>(null)
  const discoverLoading = ref(false)
  const discoverHasMore = computed(() => discoverNextCursor.value !== null)

  // Hosted (anfitrião)
  const hostedEvents = ref<EventSummary[]>([])
  const hostedNextCursor = ref<string | null>(null)
  const hostedLoading = ref(false)

  // Attending (inscrito)
  const attendingEvents = ref<EventSummary[]>([])
  const attendingNextCursor = ref<string | null>(null)
  const attendingLoading = ref(false)

  function setCached(detail: EventDetail) {
    cache.set(detail.id, detail)
  }

  function getCached(id: string): EventDetail | undefined {
    return cache.get(id)
  }

  function clearCache() {
    cache.clear()
  }

  // ========== List actions ==========

  async function fetchDiscover(filters: EventListFilters = {}, append = false) {
    if (discoverLoading.value) return
    discoverLoading.value = true
    try {
      const page = await eventsApi.listEvents(filters)
      discoverEvents.value = append ? [...discoverEvents.value, ...page.events] : page.events
      discoverNextCursor.value = page.nextCursor
    } finally {
      discoverLoading.value = false
    }
  }

  async function fetchHosted() {
    if (hostedLoading.value) return
    hostedLoading.value = true
    try {
      const page = await eventsApi.listMyHosted({})
      hostedEvents.value = page.events
      hostedNextCursor.value = page.nextCursor
    } finally {
      hostedLoading.value = false
    }
  }

  async function fetchAttending() {
    if (attendingLoading.value) return
    attendingLoading.value = true
    try {
      const page = await eventsApi.listMyAttending({})
      attendingEvents.value = page.events
      attendingNextCursor.value = page.nextCursor
    } finally {
      attendingLoading.value = false
    }
  }

  async function fetchEvent(id: string, force = false): Promise<EventDetail> {
    if (!force) {
      const cached = cache.get(id)
      if (cached) return cached
    }
    const detail = await eventsApi.getEvent(id)
    setCached(detail)
    return detail
  }

  // ========== Mutations ==========

  async function subscribe(eventId: string): Promise<SubscribeResponse> {
    const result = await eventsApi.subscribe(eventId)
    const cached = cache.get(eventId)
    if (cached) {
      cached.iAmIn = {
        status: result.status,
        waitlistPosition: result.position ?? null,
      }
    }
    return result
  }

  async function leave(eventId: string): Promise<void> {
    await eventsApi.leave(eventId)
    const cached = cache.get(eventId)
    if (cached) {
      cached.iAmIn = null
    }
    attendingEvents.value = attendingEvents.value.filter(e => e.id !== eventId)
  }

  async function confirm(eventId: string): Promise<void> {
    await eventsApi.confirm(eventId)
    const cached = cache.get(eventId)
    if (cached && cached.iAmIn) {
      cached.iAmIn = { ...cached.iAmIn, status: 'confirmed' }
    }
  }

  async function cancelEvent(eventId: string, reason?: string): Promise<void> {
    await eventsApi.deleteEvent(eventId, reason)
    const cached = cache.get(eventId)
    if (cached) {
      cached.status = 'cancelled'
      cached.cancellationReason = reason ?? null
    }
    for (const list of [discoverEvents.value, hostedEvents.value, attendingEvents.value]) {
      const e = list.find(ev => ev.id === eventId)
      if (e) {
        e.status = 'cancelled'
        e.cancellationReason = reason ?? null
      }
    }
  }

  // ========== WebSocket reactivity ==========

  /**
   * Apply a notification received via WebSocket. Idempotent — safe to call
   * multiple times for the same notification.
   */
  function applyNotification(notification: EventNotificationPayload) {
    const eventId = notification.data?.eventId ?? notification.entityId
    if (!eventId) return

    const cached = cache.get(eventId)

    switch (notification.type) {
      case 'event_cancelled': {
        if (cached) {
          cached.status = 'cancelled'
          cached.cancellationReason = notification.data?.reason ?? null
        }
        for (const list of [discoverEvents.value, hostedEvents.value, attendingEvents.value]) {
          const e = list.find(ev => ev.id === eventId)
          if (e) {
            e.status = 'cancelled'
            e.cancellationReason = notification.data?.reason ?? null
          }
        }
        break
      }
      case 'event_promoted_from_waitlist': {
        if (cached?.iAmIn?.status === 'waitlist') {
          cached.iAmIn = { status: 'subscribed', waitlistPosition: null }
        }
        // Refetch to get fresh participant counts/positions
        void fetchEvent(eventId, true).catch(() => {
          /* swallow — best-effort refresh */
        })
        break
      }
      case 'event_updated': {
        // Drop cache so next access refetches
        cache.delete(eventId)
        break
      }
      case 'event_conflict_after_edit':
      case 'event_invited':
      case 'event_reminder_48h':
      case 'event_reminder_2h':
        // No cache mutation needed — UI surfaces via notifications panel
        break
    }
  }

  return {
    cache,
    discoverEvents,
    discoverNextCursor,
    discoverLoading,
    discoverHasMore,
    hostedEvents,
    hostedNextCursor,
    hostedLoading,
    attendingEvents,
    attendingNextCursor,
    attendingLoading,
    fetchDiscover,
    fetchHosted,
    fetchAttending,
    fetchEvent,
    setCached,
    getCached,
    clearCache,
    subscribe,
    leave,
    confirm,
    cancelEvent,
    applyNotification,
  }
})
