<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Library, Plus, Package } from 'lucide-vue-next'
import { useCollectionsStore } from '../composables/useCollections'
import CollectionCard from '../components/CollectionCard.vue'
import CollectionForm from '../components/CollectionForm.vue'
import AppModal from '@/shared/ui/AppModal.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'

const router = useRouter()
const store = useCollectionsStore()

const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const deletingId = ref<string | null>(null)
const deleting = ref(false)

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

function confirmDelete(id: string) {
  deletingId.value = id
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!deletingId.value) return
  deleting.value = true
  try {
    await store.deleteCollection(deletingId.value)
  } finally {
    deleting.value = false
    showDeleteModal.value = false
    deletingId.value = null
  }
}

const deletingCollection = computed(() =>
  store.collections.find(c => c.id === deletingId.value),
)

const totalItems = computed(() =>
  store.collections.reduce((sum, c) => sum + (c.itemCount ?? 0), 0),
)

const isInitialLoading = computed(() => store.loading && store.collections.length === 0)
const isEmpty = computed(() => !store.loading && store.collections.length === 0)
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <AppPageHeader :icon="Library" title="Minhas Coleções">
      <template #subtitle>
        <span class="font-semibold text-[#cbd5e1]">{{ store.collections.length }}</span>
        <span>{{ store.collections.length === 1 ? 'coleção' : 'coleções' }}</span>
        <span class="text-[#475569]">·</span>
        <Package :size="11" class="text-[#f59e0b]" />
        <span class="font-semibold text-[#cbd5e1]">{{ totalItems }}</span>
        <span>{{ totalItems === 1 ? 'item' : 'itens' }}</span>
      </template>
      <template #action>
        <button
          class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-3.5 md:px-4 py-2 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
          @click="openCreateModal"
        >
          <Plus :size="16" :stroke-width="2.5" />
          <span class="hidden sm:inline">Nova coleção</span>
          <span class="sm:hidden">Nova</span>
        </button>
      </template>
    </AppPageHeader>

    <div class="px-4 md:px-6 py-6">
      <!-- Loading skeleton -->
      <div
        v-if="isInitialLoading"
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <div
          v-for="n in 8"
          :key="n"
          class="bg-[#1e2038] rounded-xl border border-[#252640] overflow-hidden"
        >
          <div class="aspect-[5/3] bg-[#252640] animate-pulse" />
          <div class="p-3 space-y-2">
            <div class="h-3 bg-[#252640] rounded animate-pulse w-2/3" />
            <div class="h-4 bg-[#252640] rounded animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="isEmpty"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1e2038] to-[#252640] border border-[#2e3050] flex items-center justify-center mb-5">
          <Library :size="36" class="text-[#f59e0b]" />
        </div>
        <h2 class="text-[16px] font-bold text-[#e2e8f0] mb-1.5">Nenhuma coleção ainda</h2>
        <p class="text-[13px] text-[#94a3b8] mb-6 max-w-xs">
          Comece criando sua primeira coleção de jogos, livros, cartas ou o que quiser catalogar.
        </p>
        <button
          class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
          @click="openCreateModal"
        >
          <Plus :size="16" :stroke-width="2.5" />
          Criar primeira coleção
        </button>
      </div>

      <!-- Grid -->
      <div
        v-else
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <CollectionCard
          v-for="collection in store.collections"
          :key="collection.id"
          :collection="collection"
          @click="goToCollection"
          @delete="confirmDelete"
        />
      </div>

      <!-- Error state -->
      <div
        v-if="store.error"
        class="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg"
      >
        <p class="text-[13px] text-red-400">{{ store.error }}</p>
      </div>
    </div>

    <!-- Create modal -->
    <AppModal v-if="showCreateModal" @close="closeCreateModal">
      <CollectionForm @close="closeCreateModal" />
    </AppModal>

    <AppConfirmDialog
      :open="showDeleteModal"
      title="Excluir coleção"
      confirm-label="Excluir"
      :loading="deleting"
      @cancel="showDeleteModal = false"
      @confirm="handleDelete"
    >
      <p>
        Tem certeza que deseja excluir
        <span class="text-(--color-text-primary) font-semibold">{{ deletingCollection?.name }}</span>?
      </p>
      <p class="text-(--color-danger) mt-2 text-xs">
        Todos os itens desta coleção serão excluídos permanentemente.
      </p>
    </AppConfirmDialog>
  </div>
</template>
