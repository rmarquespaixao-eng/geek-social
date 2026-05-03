<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Users, Activity, Flag, Globe, TrendingUp } from 'lucide-vue-next'
import StatCard from '@/components/admin/StatCard.vue'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface Stats {
  totalUsers: number
  onlineNow: number
  reportsPending: number
  totalCommunities: number
  reportsByReason: Record<string, number>
}

const stats = ref<Stats>({ totalUsers: 0, onlineNow: 0, reportsPending: 0, totalCommunities: 0, reportsByReason: {} })
const recentLogs = ref<any[]>([])
const loading = ref(true)

// reason → {label, variant, severity order}
const reasonSeverity = [
  { reason: 'hate',       label: 'Crítica',  variant: 'destructive' as const },
  { reason: 'harassment', label: 'Alta',     variant: 'warning'     as const },
  { reason: 'nsfw',       label: 'Média',    variant: 'default'     as const },
  { reason: 'spam',       label: 'Baixa',    variant: 'secondary'   as const },
  { reason: 'other',      label: 'Outros',   variant: 'secondary'   as const },
]

const severityItems = computed(() => {
  const byReason = stats.value.reportsByReason
  const total = Object.values(byReason).reduce((s, n) => s + n, 0)
  return reasonSeverity
    .map(s => ({ ...s, count: byReason[s.reason] ?? 0, pct: total > 0 ? Math.round(((byReason[s.reason] ?? 0) / total) * 100) : 0 }))
    .filter(s => s.count > 0)
})

onMounted(async () => {
  try {
    const [statsRes, logsRes] = await Promise.all([
      api.get('/admin/stats').catch(() => ({ data: { totalUsers: 0, onlineNow: 0, reportsPending: 0, totalCommunities: 0, reportsByReason: {} } })),
      api.get('/admin/logs?limit=8').catch(() => ({ data: { items: [] } })),
    ])
    stats.value = statsRes.data
    recentLogs.value = logsRes.data.items || []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total de Usuários" :value="stats.totalUsers.toLocaleString('pt-BR')" :icon="Users" delta="4.2% este mês" :deltaUp="true" />
      <StatCard title="Online Agora" :value="stats.onlineNow" :icon="Activity" iconColor="bg-green-500" />
      <StatCard title="Denúncias Pendentes" :value="stats.reportsPending" :icon="Flag" iconColor="bg-amber-500" />
      <StatCard title="Comunidades" :value="stats.totalCommunities" :icon="Globe" iconColor="bg-purple-500" />
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="recentLogs.length === 0" class="px-6 pb-6 text-sm text-slate-500">
            Nenhuma atividade registrada ainda.
          </div>
          <div v-else class="divide-y divide-slate-100">
            <div v-for="log in recentLogs" :key="log.id" class="flex items-start gap-3 px-6 py-3">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium uppercase text-slate-600">
                {{ log.username?.[0] || '?' }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-900">{{ log.username }}</p>
                <p class="text-xs text-slate-500">{{ log.action }} · {{ formatDate(log.createdAt) }}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Denúncias por Severidade</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="loading" class="text-sm text-slate-400">Carregando...</div>
          <div v-else-if="severityItems.length === 0" class="text-sm text-slate-400 italic">
            Nenhuma denúncia pendente.
          </div>
          <div v-else class="space-y-3">
            <div v-for="item in severityItems" :key="item.reason" class="flex items-center gap-3">
              <Badge :variant="item.variant" class="w-16 justify-center shrink-0">{{ item.label }}</Badge>
              <div class="flex-1 rounded-full bg-slate-100 h-2">
                <div class="h-2 rounded-full bg-indigo-500 transition-all" :style="{ width: item.pct + '%' }" />
              </div>
              <span class="w-6 text-right text-sm font-medium text-slate-700">{{ item.count }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
