<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

interface ActivityLog {
  id: string
  username: string
  action: string
  targetType: string
  targetId: string
  ip: string
  location: string
  userAgent: string
  createdAt: string
}

const logs = ref<ActivityLog[]>([])
const total = ref(0)
const page = ref(1)
const search = ref('')
const actionFilter = ref('')
const loading = ref(false)

const actionOptions = [
  { value: '', label: 'Todas as ações' },
  { value: 'post.create', label: 'Criar post' },
  { value: 'post.delete', label: 'Deletar post' },
  { value: 'comment.create', label: 'Comentar' },
  { value: 'user.login', label: 'Login' },
  { value: 'user.logout', label: 'Logout' },
  { value: 'collection.create', label: 'Criar coleção' },
  { value: 'report.create', label: 'Denunciar' },
]

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/logs', {
      params: { page: page.value, search: search.value, action: actionFilter.value },
    })
    logs.value = data.items
    total.value = data.total
  } catch {
    toast.error('Erro ao carregar logs')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-3">
      <div class="relative flex-1 min-w-48">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input v-model="search" placeholder="Buscar por usuário ou IP..." class="pl-9" @keyup.enter="load" />
      </div>
      <Select v-model="actionFilter" :options="actionOptions" class="w-48" />
      <Button @click="load" size="sm" :disabled="loading">Filtrar</Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50">
                <th class="px-4 py-3 text-left font-medium text-slate-500">Usuário</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Ação</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Alvo</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">IP</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Localização</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Data/Hora</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-mono">
              <tr v-if="logs.length === 0">
                <td colspan="6" class="px-4 py-8 text-center font-sans text-slate-400">
                  {{ loading ? 'Carregando...' : 'Nenhum log encontrado' }}
                </td>
              </tr>
              <tr v-for="log in logs" :key="log.id" class="hover:bg-slate-50">
                <td class="px-4 py-2.5 font-sans font-medium text-slate-900">{{ log.username }}</td>
                <td class="px-4 py-2.5">
                  <Badge variant="secondary" class="font-mono text-xs">{{ log.action }}</Badge>
                </td>
                <td class="px-4 py-2.5 text-slate-500 text-xs">{{ log.targetType }}:{{ log.targetId }}</td>
                <td class="px-4 py-2.5 text-slate-600 text-xs">{{ log.ip }}</td>
                <td class="px-4 py-2.5 font-sans text-slate-500 text-xs">{{ log.location || '—' }}</td>
                <td class="px-4 py-2.5 font-sans text-slate-500 text-xs">{{ formatDate(log.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="total > 0" class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p class="text-sm text-slate-500">{{ total }} registros</p>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="page === 1" @click="page--; load()">Anterior</Button>
            <Button size="sm" variant="outline" @click="page++; load()">Próxima</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
