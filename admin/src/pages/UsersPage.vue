<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, MoreHorizontal, Ban, UserX, RotateCcw } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { formatDateShort } from '@/lib/utils'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

interface User {
  id: string
  displayName: string
  email: string
  platformRole: string
  status: 'active' | 'suspended' | 'banned'
  avatarUrl?: string
  emailVerified: boolean
  createdAt: string
}

const users = ref<User[]>([])
const total = ref(0)
const page = ref(1)
const search = ref('')
const roleFilter = ref('')
const statusFilter = ref('')
const loading = ref(false)
const actionOpen = ref<string | null>(null)

const roleOptions = [
  { value: '', label: 'Todos os perfis' },
  { value: 'user', label: 'Usuário' },
  { value: 'moderator', label: 'Moderador' },
  { value: 'admin', label: 'Admin' },
]

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'active', label: 'Ativo' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'banned', label: 'Banido' },
]

const statusVariant: Record<string, string> = {
  active: 'success',
  suspended: 'warning',
  banned: 'destructive',
}
const statusLabel: Record<string, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  banned: 'Banido',
}

const roleVariant: Record<string, string> = {
  admin: 'destructive',
  moderator: 'warning',
  user: 'secondary',
}
const roleLabel: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Moderador',
  user: 'Usuário',
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/users', {
      params: {
        page: page.value,
        search: search.value || undefined,
        role: roleFilter.value || undefined,
        status: statusFilter.value || undefined,
      },
    })
    users.value = data.items
    total.value = data.total
  } catch {
    toast.error('Erro ao carregar usuários')
  } finally {
    loading.value = false
  }
}

async function setStatus(userId: string, status: 'active' | 'suspended' | 'banned') {
  try {
    await api.patch(`/admin/users/${userId}/status`, { status })
    toast.success('Status atualizado')
    await load()
  } catch {
    toast.error('Erro ao atualizar status')
  } finally {
    actionOpen.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative flex-1 min-w-52">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input v-model="search" placeholder="Buscar por nome ou e-mail..." class="pl-9" @keyup.enter="load" />
      </div>
      <Select v-model="roleFilter" :options="roleOptions" class="w-44" />
      <Select v-model="statusFilter" :options="statusOptions" class="w-44" />
      <Button @click="load" :disabled="loading" size="sm">{{ loading ? 'Buscando...' : 'Buscar' }}</Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50">
                <th class="px-4 py-3 text-left font-medium text-slate-500">Usuário</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">E-mail</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Perfil</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">E-mail verificado</th>
                <th class="px-4 py-3 text-left font-medium text-slate-500">Cadastro</th>
                <th class="px-4 py-3 text-right font-medium text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-if="users.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-slate-400">
                  {{ loading ? 'Carregando...' : 'Nenhum usuário encontrado' }}
                </td>
              </tr>
              <tr v-for="user in users" :key="user.id" class="hover:bg-slate-50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700 uppercase">
                      {{ (user.displayName || '?')[0] }}
                    </div>
                    <span class="font-medium text-slate-900">{{ user.displayName }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-slate-600">{{ user.email }}</td>
                <td class="px-4 py-3">
                  <Badge :variant="roleVariant[user.platformRole] || 'secondary'">{{ roleLabel[user.platformRole] || user.platformRole }}</Badge>
                </td>
                <td class="px-4 py-3">
                  <Badge :variant="statusVariant[user.status] || 'secondary'">{{ statusLabel[user.status] || user.status }}</Badge>
                </td>
                <td class="px-4 py-3">
                  <Badge :variant="user.emailVerified ? 'success' : 'warning'">{{ user.emailVerified ? 'Verificado' : 'Pendente' }}</Badge>
                </td>
                <td class="px-4 py-3 text-slate-500">{{ formatDateShort(user.createdAt) }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      size="sm" variant="outline"
                      class="text-amber-600 border-amber-300 hover:bg-amber-50"
                      @click="setStatus(user.id, 'suspended')"
                      title="Suspender"
                    >
                      <UserX class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      class="text-red-600 border-red-300 hover:bg-red-50"
                      @click="setStatus(user.id, 'banned')"
                      title="Banir"
                    >
                      <Ban class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      class="text-green-600 border-green-300 hover:bg-green-50"
                      @click="setStatus(user.id, 'active')"
                      title="Reativar"
                    >
                      <RotateCcw class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="total > 0" class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p class="text-sm text-slate-500">{{ total }} usuários encontrados</p>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="page === 1" @click="page--; load()">Anterior</Button>
            <Button size="sm" variant="outline" @click="page++; load()">Próxima</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
