import { ref, onMounted } from 'vue'
import { api } from '@/shared/http/api'
import type { CollectionTypeDefinition } from '../types'

const FALLBACK_TYPES: CollectionTypeDefinition[] = [
  { id: 'games',      key: 'games',      name: '🎮 Jogos',       description: null, icon: '🎮', isSystem: true },
  { id: 'books',      key: 'books',      name: '📚 Livros',      description: null, icon: '📚', isSystem: true },
  { id: 'cardgames',  key: 'cardgames',  name: '🃏 Card Games',  description: null, icon: '🃏', isSystem: true },
  { id: 'boardgames', key: 'boardgames', name: '🎲 Boardgames',  description: null, icon: '🎲', isSystem: true },
  { id: 'custom',     key: 'custom',     name: '⚙️ Customizado', description: null, icon: '⚙️', isSystem: true },
]

export function useCollectionTypes() {
  const types = ref<CollectionTypeDefinition[]>([])
  const loading = ref(false)

  onMounted(async () => {
    loading.value = true
    try {
      const { data } = await api.get<CollectionTypeDefinition[]>('/collection-types')
      types.value = data.length > 0 ? data : FALLBACK_TYPES
    } catch {
      types.value = FALLBACK_TYPES
    } finally {
      loading.value = false
    }
  })

  function labelFor(key: string): string {
    const t = types.value.find(t => t.key === key)
    if (!t) return key
    const icon = t.icon ? `${t.icon} ` : ''
    return `${icon}${t.name ?? key}`
  }

  return { types, loading, labelFor }
}
