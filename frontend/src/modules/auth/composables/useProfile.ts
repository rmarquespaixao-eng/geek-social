import { ref, computed, isRef, type Ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/shared/auth/authStore'
import type { PublicProfile } from '@/shared/types/auth.types'
import * as usersService from '../services/usersService'

export function useProfile(userIdSource: Ref<string> | string) {
  const store = useAuthStore()
  const profile = ref<PublicProfile | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notFound = ref(false)

  const isOwnProfile = computed(() => {
    const id = isRef(userIdSource) ? userIdSource.value : userIdSource
    return store.user?.id === id
  })

  async function fetchProfile() {
    const userId = isRef(userIdSource) ? userIdSource.value : userIdSource
    loading.value = true
    error.value = null
    notFound.value = false
    try {
      profile.value = await usersService.getProfile(userId)
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        notFound.value = true
      } else {
        error.value = (err as any)?.response?.data?.message ?? 'Erro ao carregar perfil.'
      }
    } finally {
      loading.value = false
    }
  }

  async function handleAvatarUpload(file: File) {
    const result = await usersService.uploadAvatar(file)
    if (store.user) store.user.avatarUrl = result.avatarUrl
    if (profile.value) profile.value.avatarUrl = result.avatarUrl
  }

  async function handleAvatarRemove() {
    await usersService.deleteAvatar()
    if (store.user) store.user.avatarUrl = undefined
    if (profile.value) profile.value.avatarUrl = undefined
  }

  async function handleCoverUpload(file: File) {
    const result = await usersService.uploadCover(file)
    if (store.user) store.user.coverUrl = result.coverUrl
    if (profile.value) profile.value.coverUrl = result.coverUrl
  }

  async function handleCoverRemove() {
    await usersService.deleteCover()
    if (store.user) store.user.coverUrl = undefined
    if (profile.value) profile.value.coverUrl = undefined
  }

  async function handleBackgroundUpload(file: File) {
    const result = await usersService.uploadProfileBackground(file)
    if (store.user) store.user.profileBackgroundUrl = result.profileBackgroundUrl
    if (profile.value) profile.value.profileBackgroundUrl = result.profileBackgroundUrl
  }

  async function handleBackgroundRemove() {
    await usersService.deleteProfileBackground()
    if (store.user) store.user.profileBackgroundUrl = undefined
    if (profile.value) profile.value.profileBackgroundUrl = undefined
  }

  return {
    profile,
    loading,
    error,
    notFound,
    isOwnProfile,
    fetchProfile,
    handleAvatarUpload,
    handleAvatarRemove,
    handleCoverUpload,
    handleCoverRemove,
    handleBackgroundUpload,
    handleBackgroundRemove,
  }
}
