<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, X, Trash2 } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Switch from '@/components/ui/Switch.vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardDescription from '@/components/ui/CardDescription.vue'

interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  enabled: boolean
  updatedAt: string
}

const flags = ref<FeatureFlag[]>([])
const loading = ref(false)
const showForm = ref(false)
const saving = ref(false)
const form = ref({ key: '', name: '', description: '', enabled: false })

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/feature-flags')
    flags.value = data
  } catch {
    toast.error('Erro ao carregar feature flags')
  } finally {
    loading.value = false
  }
}

async function toggle(flag: FeatureFlag) {
  try {
    await api.patch(`/admin/feature-flags/${flag.id}`, { enabled: !flag.enabled })
    flag.enabled = !flag.enabled
    toast.success(`${flag.name} ${flag.enabled ? 'ativada' : 'desativada'}`)
  } catch {
    toast.error('Erro ao atualizar flag')
    flag.enabled = !flag.enabled
  }
}

async function create() {
  saving.value = true
  try {
    const { data } = await api.post('/admin/feature-flags', { ...form.value })
    flags.value.push(data)
    form.value = { key: '', name: '', description: '', enabled: false }
    showForm.value = false
    toast.success('Feature flag criada')
  } catch {
    toast.error('Erro ao criar flag')
  } finally {
    saving.value = false
  }
}

async function remove(flag: FeatureFlag) {
  if (!confirm(`Remover flag "${flag.key}"?`)) return
  try {
    await api.delete(`/admin/feature-flags/${flag.id}`)
    flags.value = flags.value.filter(f => f.id !== flag.id)
    toast.success('Flag removida')
  } catch {
    toast.error('Erro ao remover flag')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-slate-500">Habilite ou desabilite recursos da plataforma sem deploy.</p>
      <Button size="sm" @click="showForm = !showForm">
        <component :is="showForm ? X : Plus" class="h-4 w-4" />
        {{ showForm ? 'Cancelar' : 'Nova Flag' }}
      </Button>
    </div>

    <Card v-if="showForm">
      <CardHeader><CardTitle>Nova Feature Flag</CardTitle></CardHeader>
      <CardContent>
        <form @submit.prevent="create" class="grid gap-4 sm:grid-cols-3">
          <div class="space-y-1.5">
            <Label>Chave (snake_case)</Label>
            <Input v-model="form.key" placeholder="new_onboarding_flow" required pattern="[a-z_]+" />
          </div>
          <div class="space-y-1.5">
            <Label>Nome</Label>
            <Input v-model="form.name" placeholder="Novo Onboarding" required />
          </div>
          <div class="space-y-1.5">
            <Label>Descrição</Label>
            <Input v-model="form.description" placeholder="Descrição opcional" />
          </div>
          <div class="space-y-1.5">
            <Label>Ativar imediatamente</Label>
            <Switch v-model="form.enabled" />
          </div>
          <div class="sm:col-span-3">
            <Button type="submit" size="sm" :disabled="saving">
              {{ saving ? 'Salvando...' : 'Criar Flag' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <div class="grid gap-3">
      <div v-if="flags.length === 0 && !loading" class="py-12 text-center text-slate-400">
        Nenhuma feature flag configurada.
      </div>
      <Card v-for="flag in flags" :key="flag.id">
        <CardContent class="flex items-center justify-between p-4">
          <div class="min-w-0 flex-1 mr-4">
            <div class="flex items-center gap-2">
              <span class="font-medium text-slate-900">{{ flag.name }}</span>
              <Badge variant="secondary" class="font-mono text-xs">{{ flag.key }}</Badge>
              <Badge :variant="flag.enabled ? 'success' : 'secondary'">{{ flag.enabled ? 'Ativo' : 'Inativo' }}</Badge>
            </div>
            <p v-if="flag.description" class="mt-0.5 text-sm text-slate-500">{{ flag.description }}</p>
          </div>
          <div class="flex items-center gap-2">
            <Switch :modelValue="flag.enabled" @update:modelValue="toggle(flag)" />
            <Button size="sm" variant="ghost" class="text-red-500 hover:text-red-700" @click="remove(flag)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
