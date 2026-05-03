<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, EyeOff, Eye } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { formatDateShort } from '@/lib/utils'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

interface Community {
  id: string
  name: string
  slug: string
  ownerId: string | null
  memberCount: number
  topicCount: number
  category: string
  status: 'active' | 'suspended'
  createdAt: string
}

const communities = ref<Community[]>([])
const total = ref(0)
const page = ref(1)
const search = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/communities', {
      params: { page: page.value, search: search.value },
    })
    communities.value = data.items ?? []
    total.value = data.total
  } catch {
    toast.error('Erro ao carregar comunidades')
  } finally {
    loading.value = false
  }
}

async function toggleStatus(id: string, current: string) {
  const next = current === 'active' ? 'suspended' : 'active'
  try {
    await api.patch(`/admin/communities/${id}/status`, { status: next })
    await load()
    toast.success(`Comunidade ${next === 'active' ? 'reativada' : 'suspensa'}`)
  } catch {
    toast.error('Erro ao atualizar status')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input v-model="search" placeholder="Buscar comunidade..." class="pl-9" @keyup.enter="load" />
      </div>
      <Button @click="load" size="sm" :disabled="loading">Buscar</Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50">
                <th class="px-4 py-3 text-left font-medium text-slate-500">Comunidade</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Slug</th>
                <th class="px-4 py-3 text-right font-medium text-slate-500">Membros</th>
                <th class="px-4 py-3 text-right font-medium text-slate-500">Tópicos</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Criada</th>
                <th class="px-4 py-3 text-right font-medium text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-if="communities.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-400">
                  {{ loading ? 'Carregando...' : 'Nenhuma comunidade encontrada' }}
                </td>
              </tr>
              <tr v-for="c in communities" :key="c.id" class="hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-900">{{ c.name }}</td>
                <td class="px-4 py-3 text-slate-500 font-mono text-xs">{{ c.slug }}</td>
                <td class="px-4 py-3 text-right text-slate-600">{{ c.memberCount?.toLocaleString('pt-BR') }}</td>
                <td class="px-4 py-3 text-right text-slate-600">{{ c.topicCount?.toLocaleString('pt-BR') }}</td>
                <td class="px-4 py-3">
                  <Badge :variant="c.status === 'active' ? 'success' : 'warning'">
                    {{ c.status === 'active' ? 'Ativa' : 'Suspensa' }}
                  </Badge>
                </td>
                <td class="px-4 py-3 text-slate-500">{{ formatDateShort(c.createdAt) }}</td>
                <td class="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" @click="toggleStatus(c.id, c.status)">
                    <component :is="c.status === 'active' ? EyeOff : Eye" class="h-3.5 w-3.5 mr-1" />
                    {{ c.status === 'active' ? 'Suspender' : 'Reativar' }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="total > 0" class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p class="text-sm text-slate-500">{{ total }} comunidades</p>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="page === 1" @click="page--; load()">Anterior</Button>
            <Button size="sm" variant="outline" @click="page++; load()">Próxima</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
