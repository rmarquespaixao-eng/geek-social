<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Download, Trash2 } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardDescription from '@/components/ui/CardDescription.vue'

interface LgpdRequest {
  id: string
  userId: string
  type: 'export' | 'delete' | 'rectify' | 'portability'
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  notes: string | null
  createdAt: string
  completedAt: string | null
  legalDeadlineAt: string
}

const requests = ref<LgpdRequest[]>([])
const total = ref(0)
const page = ref(1)
const statusFilter = ref('')
const loading = ref(false)

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'pending', label: 'Pendente' },
  { value: 'processing', label: 'Processando' },
  { value: 'completed', label: 'Concluído' },
  { value: 'rejected', label: 'Rejeitado' },
]

const statusVariant: Record<string, any> = {
  pending: 'warning', processing: 'default', completed: 'success', rejected: 'destructive',
}
const statusLabel: Record<string, string> = {
  pending: 'Pendente', processing: 'Processando', completed: 'Concluído', rejected: 'Rejeitado',
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/lgpd-requests', {
      params: { page: page.value, status: statusFilter.value || undefined },
    })
    requests.value = data.items
    total.value = data.total
  } catch {
    toast.error('Erro ao carregar solicitações')
  } finally {
    loading.value = false
  }
}

async function process(id: string, action: 'approve' | 'reject') {
  try {
    await api.post(`/admin/lgpd-requests/${id}/${action}`)
    await load()
    toast.success(action === 'approve' ? 'Solicitação aprovada' : 'Solicitação rejeitada')
  } catch {
    toast.error('Erro ao processar solicitação')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <Card class="border-amber-200 bg-amber-50">
      <CardContent class="p-4">
        <p class="text-sm text-amber-800">
          <strong>LGPD Art. 18:</strong> Solicitações de portabilidade e exclusão de dados devem ser atendidas em até 15 dias corridos.
          Exportações são geradas automaticamente. Exclusões requerem confirmação manual.
        </p>
      </CardContent>
    </Card>

    <div class="flex gap-3">
      <Select v-model="statusFilter" :options="statusOptions" class="w-48" />
      <Button @click="load" size="sm" :disabled="loading">Filtrar</Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50">
                <th class="px-4 py-3 text-left font-medium text-slate-500">Usuário</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Prazo</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Tipo</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Solicitado em</th>
                <th class="px-4 py-3 text-right font-medium text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-if="requests.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-slate-400">
                  {{ loading ? 'Carregando...' : 'Nenhuma solicitação encontrada' }}
                </td>
              </tr>
              <tr v-for="r in requests" :key="r.id" class="hover:bg-slate-50">
                <td class="px-4 py-3 font-medium text-slate-900 font-mono text-xs truncate max-w-[140px]" :title="r.userId">{{ r.userId }}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">{{ formatDate(r.legalDeadlineAt) }}</td>
                <td class="px-4 py-3">
                  <Badge :variant="r.type === 'export' ? 'default' : 'destructive'">
                    <component :is="r.type === 'export' ? Download : Trash2" class="h-3 w-3 mr-1" />
                    {{ r.type === 'export' ? 'Exportar dados' : 'Excluir conta' }}
                  </Badge>
                </td>
                <td class="px-4 py-3"><Badge :variant="statusVariant[r.status]">{{ statusLabel[r.status] }}</Badge></td>
                <td class="px-4 py-3 text-slate-500">{{ formatDate(r.createdAt) }}</td>
                <td class="px-4 py-3 text-right">
                  <div v-if="r.status === 'pending'" class="flex justify-end gap-1">
                    <Button size="sm" @click="process(r.id, 'approve')">Aprovar</Button>
                    <Button size="sm" variant="outline" class="text-red-600 border-red-300" @click="process(r.id, 'reject')">Rejeitar</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="total > 0" class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p class="text-sm text-slate-500">{{ total }} solicitações</p>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="page === 1" @click="page--; load()">Anterior</Button>
            <Button size="sm" variant="outline" @click="page++; load()">Próxima</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
