import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type SidebarMode = 'expanded' | 'collapsed' | 'hidden'

const SIDEBAR_KEY = 'ui:sidebarMode'
const CHATLIST_KEY = 'ui:chatListVisible'

function readSidebarMode(): SidebarMode {
  const v = localStorage.getItem(SIDEBAR_KEY)
  if (v === 'expanded' || v === 'collapsed' || v === 'hidden') return v
  return 'expanded'
}

function readChatListVisible(): boolean {
  const v = localStorage.getItem(CHATLIST_KEY)
  if (v === null) return true
  return v === 'true'
}

export const useUiPreferences = defineStore('uiPreferences', () => {
  const sidebarMode = ref<SidebarMode>(readSidebarMode())
  const chatListVisible = ref<boolean>(readChatListVisible())

  watch(sidebarMode, (v) => localStorage.setItem(SIDEBAR_KEY, v))
  watch(chatListVisible, (v) => localStorage.setItem(CHATLIST_KEY, String(v)))

  function cycleSidebar(): void {
    if (sidebarMode.value === 'expanded') sidebarMode.value = 'collapsed'
    else if (sidebarMode.value === 'collapsed') sidebarMode.value = 'hidden'
    else sidebarMode.value = 'expanded'
  }

  function showSidebar(): void {
    sidebarMode.value = 'expanded'
  }

  function toggleChatList(): void {
    chatListVisible.value = !chatListVisible.value
  }

  return {
    sidebarMode,
    chatListVisible,
    cycleSidebar,
    showSidebar,
    toggleChatList,
  }
})
