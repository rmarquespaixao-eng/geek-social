<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, X, Trash2, ChevronDown, ChevronUp, UserCog } from 'lucide-vue-next'
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

interface FeatureFlag {
  id: string
  key: string
  name: string | null
  description: string | null
  enabled: boolean
  updatedAt: string
}

interface UserOverride {
  userId: string
  displayName: string | null
  email: string | null
  enabled: boolean
  updatedAt: string
}

interface UserResult {
  id: string
  displayName: string
  email: string
}

const flags = ref<FeatureFlag[]>([])
const loading = ref(false)
const showForm = ref(false)
const saving = ref(false)
const form = ref({ key: '', name: '', description: '', enabled: false })

// overrides state keyed by flag id
const expandedFlag = ref<string | null>(null)
const overrides = ref<Record<string, UserOverride[]>>({})
const overridesLoading = ref<Record<string, boolean>>({})

// user search per flag
const userSearch = ref<Record<string, string>>({})
const userResults = ref<Record<string, UserResult[]>>({})
const userSearchLoading = ref<Record<string, boolean>>({})
const selectedUser = ref<Record<string, UserResult | null>>({})
const overrideEnabled = ref<Record<string, boolean>>({})

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
    toast.success(`${flag.name ?? flag.key} ${flag.enabled ? 'ativada' : 'desativada'}`)
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

// ── User overrides ────────────────────────────────────────────────

async function toggleOverrides(flag: FeatureFlag) {
  if (expandedFlag.value === flag.id) {
    expandedFlag.value = null
    return
  }
  expandedFlag.value = flag.id
  await loadOverrides(flag.id)
}

async function loadOverrides(flagId: string) {
  overridesLoading.value[flagId] = true
  try {
    const { data } = await api.get(`/admin/feature-flags/${flagId}/overrides`)
    overrides.value[flagId] = data
  } catch {
    toast.error('Erro ao carregar overrides')
  } finally {
    overridesLoading.value[flagId] = false
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null

async function searchUsers(flagId: string) {
  const query = userSearch.value[flagId] ?? ''
  if (searchDebounce) clearTimeout(searchDebounce)
  if (query.length < 2) {
    userResults.value[flagId] = []
    return
  }
  searchDebounce = setTimeout(async () => {
    userSearchLoading.value[flagId] = true
    try {
      const { data } = await api.get('/admin/users', { params: { search: query, pageSize: 8 } })
      userResults.value[flagId] = data.items
    } catch {
      userResults.value[flagId] = []
    } finally {
      userSearchLoading.value[flagId] = false
    }
  }, 300)
}

function selectUser(flagId: string, user: UserResult) {
  selectedUser.value[flagId] = user
  userSearch.value[flagId] = `${user.displayName} (${user.email})`
  userResults.value[flagId] = []
}

async function addOverride(flagId: string) {
  const user = selectedUser.value[flagId]
  if (!user) { toast.error('Selecione um usuário'); return }
  try {
    await api.put(`/admin/feature-flags/${flagId}/overrides/${user.id}`, {
      enabled: overrideEnabled.value[flagId] ?? false,
    })
    await loadOverrides(flagId)
    userSearch.value[flagId] = ''
    selectedUser.value[flagId] = null
    overrideEnabled.value[flagId] = false
    toast.success('Override definido')
  } catch {
    toast.error('Erro ao definir override')
  }
}

async function toggleOverrideEnabled(flagId: string, override: UserOverride) {
  try {
    await api.put(`/admin/feature-flags/${flagId}/overrides/${override.userId}`, {
      enabled: !override.enabled,
    })
    override.enabled = !override.enabled
    toast.success('Override atualizado')
  } catch {
    toast.error('Erro ao atualizar override')
    override.enabled = !override.enabled
  }
}

async function removeOverride(flagId: string, userId: string) {
  try {
    await api.delete(`/admin/feature-flags/${flagId}/overrides/${userId}`)
    overrides.value[flagId] = overrides.value[flagId].filter(o => o.userId !== userId)
    toast.success('Override removido')
  } catch {
    toast.error('Erro ao remover override')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-slate-500">Habilite ou desabilite recursos da plataforma sem deploy. Overrides por usuário sobrescrevem o padrão global.</p>
      <Button size="sm" @click="showForm = !showForm">
        <component :is="showForm ? X : Plus" class="h-4 w-4" />
        {{ showForm ? 'Cancelar' : 'Nova Flag' }}
      </Button>
    </div>

    <Card v-if="showForm">
      <CardHeader><CardTitle>Nova Feature Flag</CardTitle></CardHeader>
      <div class="p-4">
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
      </div>
    </Card>

    <div class="grid gap-3">
      <div v-if="flags.length === 0 && !loading" class="py-12 text-center text-slate-400">
        Nenhuma feature flag configurada.
      </div>

      <Card v-for="flag in flags" :key="flag.id">
        <!-- Flag header -->
        <CardContent class="flex items-center justify-between p-4">
          <div class="min-w-0 flex-1 mr-4">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-slate-900">{{ flag.name ?? flag.key }}</span>
              <Badge variant="secondary" class="font-mono text-xs">{{ flag.key }}</Badge>
              <Badge :variant="flag.enabled ? 'success' : 'secondary'">{{ flag.enabled ? 'Ativo' : 'Inativo' }}</Badge>
            </div>
            <p v-if="flag.description" class="mt-0.5 text-sm text-slate-500">{{ flag.description }}</p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              class="text-slate-500 hover:text-slate-800 gap-1"
              @click="toggleOverrides(flag)"
              :title="expandedFlag === flag.id ? 'Fechar overrides' : 'Gerenciar overrides por usuário'"
            >
              <UserCog class="h-4 w-4" />
              <component :is="expandedFlag === flag.id ? ChevronUp : ChevronDown" class="h-3 w-3" />
            </Button>
            <Switch :modelValue="flag.enabled" @update:modelValue="toggle(flag)" />
            <Button size="sm" variant="ghost" class="text-red-500 hover:text-red-700" @click="remove(flag)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </CardContent>

        <!-- User overrides panel -->
        <div v-if="expandedFlag === flag.id" class="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">Overrides por usuário</p>

          <!-- Loading -->
          <div v-if="overridesLoading[flag.id]" class="text-sm text-slate-400">Carregando...</div>

          <!-- Existing overrides -->
          <div v-else>
            <div v-if="!overrides[flag.id]?.length" class="text-sm text-slate-400 italic">
              Nenhum override definido — todos os usuários usam o valor global.
            </div>
            <div v-else class="space-y-1.5">
              <div
                v-for="ov in overrides[flag.id]"
                :key="ov.userId"
                class="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div class="text-sm">
                  <span class="font-medium text-slate-800">{{ ov.displayName ?? ov.userId }}</span>
                  <span v-if="ov.email" class="ml-1.5 text-slate-500">{{ ov.email }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Badge :variant="ov.enabled ? 'success' : 'secondary'" class="text-xs">
                    {{ ov.enabled ? 'Ativo' : 'Inativo' }}
                  </Badge>
                  <Switch
                    :modelValue="ov.enabled"
                    @update:modelValue="toggleOverrideEnabled(flag.id, ov)"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    class="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                    @click="removeOverride(flag.id, ov.userId)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- Add override -->
          <div class="pt-2 border-t border-slate-100">
            <p class="text-xs font-medium text-slate-500 mb-2">Adicionar override</p>
            <div class="flex gap-2 items-start flex-wrap">
              <div class="relative flex-1 min-w-[200px]">
                <Input
                  :modelValue="userSearch[flag.id] ?? ''"
                  @update:modelValue="(v: string) => { userSearch[flag.id] = v; searchUsers(flag.id) }"
                  placeholder="Buscar por nome ou e-mail"
                  class="text-sm"
                />
                <!-- Results dropdown -->
                <div
                  v-if="userResults[flag.id]?.length"
                  class="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-md"
                >
                  <button
                    v-for="u in userResults[flag.id]"
                    :key="u.id"
                    type="button"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    @click="selectUser(flag.id, u)"
                  >
                    <span class="font-medium">{{ u.displayName }}</span>
                    <span class="ml-1.5 text-slate-500">{{ u.email }}</span>
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Switch
                  :modelValue="overrideEnabled[flag.id] ?? false"
                  @update:modelValue="(v: boolean) => overrideEnabled[flag.id] = v"
                />
                <span class="text-sm text-slate-600">{{ (overrideEnabled[flag.id] ?? false) ? 'Ativo' : 'Inativo' }}</span>
              </div>
              <Button size="sm" @click="addOverride(flag.id)" :disabled="!selectedUser[flag.id]">
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
