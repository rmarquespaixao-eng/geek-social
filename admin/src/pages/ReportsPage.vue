<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

interface Report {
  id: string
  reporterId: string
  targetType: 'post' | 'comment' | 'user' | 'community'
  targetId: string
  reason: string
  description: string | null
  status: 'pending' | 'reviewed' | 'dismissed'
  createdAt: string
}

const reports = ref<Report[]>([])
const total = ref(0)
const page = ref(1)
const statusFilter = ref('')
const loading = ref(false)

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'pending', label: 'Pendente' },
  { value: 'reviewing', label: 'Em análise' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'dismissed', label: 'Descartado' },
]

const statusVariant: Record<string, any> = {
  pending: 'warning', reviewed: 'success', dismissed: 'secondary',
}
const statusLabel: Record<string, string> = {
  pending: 'Pendente', reviewed: 'Revisado', dismissed: 'Descartado',
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/reports', {
      params: { page: page.value, status: statusFilter.value || undefined },
    })
    reports.value = data.items ?? []
    total.value = data.total
  } catch {
    toast.error('Erro ao carregar denúncias')
  } finally {
    loading.value = false
  }
}

async function updateStatus(id: string, status: string) {
  try {
    await api.patch(`/admin/reports/${id}/status`, { status })
    await load()
    toast.success('Status atualizado')
  } catch {
    toast.error('Erro ao atualizar')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-3">
      <Select v-model="statusFilter" :options="statusOptions" class="w-44" />
      <Button @click="load" size="sm" :disabled="loading">Filtrar</Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50">
                <th class="px-4 py-3 text-left font-medium text-slate-500">Alvo</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Motivo</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Data</th>
                <th class="px-4 py-3 text-right font-medium text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-if="reports.length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-slate-400">
                  {{ loading ? 'Carregando...' : 'Nenhuma denúncia encontrada' }}
                </td>
              </tr>
              <tr v-for="r in reports" :key="r.id" class="hover:bg-slate-50">
                <td class="px-4 py-3">
                  <Badge variant="secondary">{{ r.targetType }}</Badge>
                </td>
                <td class="px-4 py-3 max-w-48 truncate text-slate-600">{{ r.reason }}</td>
                <td class="px-4 py-3"><Badge :variant="statusVariant[r.status]">{{ statusLabel[r.status] ?? r.status }}</Badge></td>
                <td class="px-4 py-3 text-slate-500">{{ formatDate(r.createdAt) }}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end gap-1">
                    <Button v-if="r.status === 'pending'" size="sm" @click="updateStatus(r.id, 'reviewed')">Revisar</Button>
                    <Button v-if="r.status === 'pending'" size="sm" variant="ghost" @click="updateStatus(r.id, 'dismissed')">Descartar</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="total > 0" class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p class="text-sm text-slate-500">{{ total }} denúncias</p>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="page === 1" @click="page--; load()">Anterior</Button>
            <Button size="sm" variant="outline" @click="page++; load()">Próxima</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
