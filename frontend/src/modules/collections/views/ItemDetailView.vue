<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-vue-next'
import { useItemsStore } from '../composables/useItems'
import { useCollectionsStore } from '../composables/useCollections'
import { useAuthStore } from '@/shared/auth/authStore'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import ItemDetailContent from '../components/ItemDetailContent.vue'

const route = useRoute()
const router = useRouter()

const collectionsStore = useCollectionsStore()
const itemsStore = useItemsStore()
const auth = useAuthStore()

const collectionId = computed(() => route.params.id as string)
const itemId = computed(() => route.params.itemId as string)
const fromItems = computed(() => route.query.from === 'items')

function backTarget() {
  return fromItems.value ? '/collections?tab=items' : `/collections/${collectionId.value}`
}

function goBack() {
  router.push(backTarget())
}

function goToEdit() {
  if (!item.value) return
  const query = fromItems.value ? '?from=items' : ''
  router.push(`/collections/${collectionId.value}/items/${item.value.id}/edit${query}`)
}

const showDeleteModal = ref(false)
const deleting = ref(false)

onMounted(async () => {
  await collectionsStore.fetchCollection(collectionId.value)
  await itemsStore.fetchItem(collectionId.value, itemId.value)
})

const item = computed(() => itemsStore.current)
const collection = computed(() => collectionsStore.current)
const isOwner = computed(() =>
  Boolean(collection.value && auth.user && collection.value.userId === auth.user.id),
)

async function handleDelete() {
  if (!item.value) return
  deleting.value = true
  try {
    const ok = await itemsStore.deleteItem(collectionId.value, item.value.id)
    if (ok) router.push(backTarget())
  } finally {
    deleting.value = false
    showDeleteModal.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <!-- Loading -->
    <div v-if="itemsStore.loading && !item" class="px-4 md:px-8 py-6">
      <div class="max-w-4xl mx-auto md:flex gap-8">
        <div class="w-full md:w-[260px] flex-shrink-0 aspect-[3/4] bg-[#1e2038] rounded-2xl animate-pulse" />
        <div class="flex-1 mt-4 md:mt-0 space-y-3">
          <div class="h-7 bg-[#1e2038] rounded animate-pulse w-2/3" />
          <div class="h-4 bg-[#1e2038] rounded animate-pulse w-1/4" />
          <div class="h-20 bg-[#1e2038] rounded animate-pulse" />
        </div>
      </div>
    </div>

    <template v-else-if="item">
      <!-- Top bar -->
      <div class="sticky top-0 z-10 bg-[#0f0f1a]/85 backdrop-blur-md border-b border-[#1a1b2e]">
        <div class="max-w-4xl mx-auto h-16 px-4 md:px-8 flex items-center justify-between gap-4">
          <button
            class="flex items-center gap-2 text-[13px] font-medium text-[#94a3b8] hover:text-[#e2e8f0] transition-colors group"
            @click="goBack"
          >
            <ArrowLeft :size="16" class="group-hover:-translate-x-0.5 transition-transform" />
            <span class="truncate max-w-[180px] md:max-w-xs">
              {{ fromItems ? 'Todos os itens' : (collection?.name ?? 'Coleção') }}
            </span>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="max-w-4xl mx-auto px-4 md:px-8 py-6">
        <h1 class="text-[24px] md:text-[28px] font-bold text-[#e2e8f0] leading-tight mb-4">
          {{ item.name }}
        </h1>

        <ItemDetailContent
          :item="item"
          :field-schema="collection?.fieldSchema"
          variant="default"
        >
          <template v-if="isOwner" #actions>
            <div class="flex flex-wrap gap-2 mt-5">
              <button
                class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
                @click="goToEdit"
              >
                <Pencil :size="14" :stroke-width="2.5" />
                Editar
              </button>
              <button
                class="flex items-center gap-1.5 bg-[#252640] hover:bg-[#ef4444]/20 hover:text-[#ef4444] active:scale-95 text-[#94a3b8] text-[13px] font-semibold px-4 py-2 rounded-lg transition-all border border-[#2e3050]"
                @click="showDeleteModal = true"
              >
                <Trash2 :size="14" />
                Excluir
              </button>
            </div>
          </template>
        </ItemDetailContent>
      </div>
    </template>

    <AppConfirmDialog
      :open="showDeleteModal && !!item"
      title="Excluir item"
      confirm-label="Excluir"
      :loading="deleting"
      @cancel="showDeleteModal = false"
      @confirm="handleDelete"
    >
      <p>
        Tem certeza que deseja excluir
        <span class="text-(--color-text-primary) font-semibold">{{ item?.name }}</span>?
      </p>
      <p class="text-(--color-danger) mt-2 text-xs">Essa ação não pode ser desfeita.</p>
    </AppConfirmDialog>
  </div>
</template>
