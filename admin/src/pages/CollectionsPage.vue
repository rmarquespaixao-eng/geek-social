<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'

interface CollectionType {
  id: string
  name: string
  description: string
  icon: string
  active: boolean
}

const types = ref<CollectionType[]>([])
const loading = ref(false)
const showForm = ref(false)
const editId = ref<string | null>(null)
const form = ref({ name: '', description: '', icon: '', active: true })

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/admin/collection-types')
    types.value = data
  } catch {
    toast.error('Erro ao carregar tipos de coleção')
  } finally {
    loading.value = false
  }
}

async function save() {
  try {
    if (editId.value) {
      await api.put(`/admin/collection-types/${editId.value}`, form.value)
      toast.success('Tipo atualizado')
    } else {
      await api.post('/admin/collection-types', form.value)
      toast.success('Tipo criado')
    }
    resetForm()
    load()
  } catch {
    toast.error('Erro ao salvar')
  }
}

async function toggleActive(item: CollectionType) {
  try {
    await api.patch(`/admin/collection-types/${item.id}`, { active: !item.active })
    item.active = !item.active
  } catch {
    toast.error('Erro ao atualizar')
  }
}

async function remove(id: string) {
  if (!confirm('Confirmar exclusão?')) return
  try {
    await api.delete(`/admin/collection-types/${id}`)
    types.value = types.value.filter(t => t.id !== id)
    toast.success('Tipo removido')
  } catch {
    toast.error('Erro ao remover')
  }
}

function startEdit(item: CollectionType) {
  editId.value = item.id
  form.value = { name: item.name, description: item.description, icon: item.icon, active: item.active }
  showForm.value = true
}

function resetForm() {
  editId.value = null
  form.value = { name: '', description: '', icon: '', active: true }
  showForm.value = false
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <Button v-if="!showForm" @click="showForm = true" size="sm">
        <Plus class="h-4 w-4" /> Novo Tipo
      </Button>
    </div>

    <Card v-if="showForm">
      <CardHeader>
        <CardTitle>{{ editId ? 'Editar Tipo' : 'Novo Tipo de Coleção' }}</CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="save" class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label>Nome</Label>
            <Input v-model="form.name" placeholder="Ex: Mangás" required />
          </div>
          <div class="space-y-1.5">
            <Label>Ícone (emoji)</Label>
            <Input v-model="form.icon" placeholder="📚" />
          </div>
          <div class="space-y-1.5 sm:col-span-2">
            <Label>Descrição</Label>
            <Input v-model="form.description" placeholder="Descrição do tipo de coleção" />
          </div>
          <div class="flex items-center gap-3 sm:col-span-2">
            <Switch v-model="form.active" />
            <Label>Ativo</Label>
          </div>
          <div class="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm"><Check class="h-4 w-4" /> Salvar</Button>
            <Button type="button" variant="outline" size="sm" @click="resetForm"><X class="h-4 w-4" /> Cancelar</Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50">
              <th class="px-4 py-3 text-left font-medium text-slate-500">Tipo</th>
              <th class="px-4 py-3 text-left font-medium text-slate-500">Descrição</th>
              <th class="px-4 py-3 text-left font-medium text-slate-500">Status</th>
              <th class="px-4 py-3 text-right font-medium text-slate-500">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="types.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-slate-400">
                {{ loading ? 'Carregando...' : 'Nenhum tipo cadastrado' }}
              </td>
            </tr>
            <tr v-for="t in types" :key="t.id" class="hover:bg-slate-50">
              <td class="px-4 py-3">
                <span class="mr-2">{{ t.icon }}</span>
                <span class="font-medium text-slate-900">{{ t.name }}</span>
              </td>
              <td class="px-4 py-3 text-slate-500">{{ t.description }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <Switch :modelValue="t.active" @update:modelValue="toggleActive(t)" />
                  <Badge :variant="t.active ? 'success' : 'secondary'">{{ t.active ? 'Ativo' : 'Inativo' }}</Badge>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" @click="startEdit(t)"><Pencil class="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" class="text-red-500 hover:text-red-700" @click="remove(t.id)"><Trash2 class="h-4 w-4" /></Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  </div>
</template>
