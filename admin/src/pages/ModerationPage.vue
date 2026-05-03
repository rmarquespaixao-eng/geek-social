<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Save, Info } from 'lucide-vue-next'
import { api } from '@/lib/api'
import { toast } from 'vue-sonner'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Switch from '@/components/ui/Switch.vue'
import Select from '@/components/ui/Select.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import Separator from '@/components/ui/Separator.vue'

interface AiConfig {
  enabled: boolean
  provider: string
  apiKey: string
  model: string
  endpoint: string
  moderateText: boolean
  moderateImages: boolean
  moderateVideos: boolean
  textThreshold: number
  imageThreshold: number
  autoRemove: boolean
  autoFlag: boolean
  notifyModerators: boolean
}

interface AgeVerifConfig {
  enabled: boolean
  minimumAge: number
  method: string
  requireVerification: boolean
}

const ai = ref<AiConfig>({
  enabled: false,
  provider: 'none',
  apiKey: '',
  model: '',
  endpoint: '',
  moderateText: true,
  moderateImages: true,
  moderateVideos: false,
  textThreshold: 0.8,
  imageThreshold: 0.9,
  autoRemove: false,
  autoFlag: true,
  notifyModerators: true,
})

const ageVerif = ref<AgeVerifConfig>({
  enabled: true,
  minimumAge: 16,
  method: 'self-declare',
  requireVerification: false,
})

const loading = ref(false)
const saving = ref(false)

const providerOptions = [
  { value: 'none', label: 'Nenhum (desativado)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'custom', label: 'Endpoint customizado (HTTP)' },
]

const modelsByProvider: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (recomendado)' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'omni-moderation-latest', label: 'Omni Moderation (imagens)' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (mais barato)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ],
  google: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (recomendado)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  custom: [{ value: 'custom', label: 'Definido pelo endpoint' }],
}

const availableModels = computed(() => modelsByProvider[ai.value.provider] || [])
const showEndpoint = computed(() => ai.value.provider === 'custom')
const showApiKey = computed(() => !['none', 'custom'].includes(ai.value.provider))

const ageMethodOptions = [
  { value: 'self-declare', label: 'Autodeclaração (data de nascimento)' },
  { value: 'credit-card', label: 'Verificação por cartão de crédito' },
  { value: 'document-check', label: 'Verificação de documento (spot-check)' },
  { value: 'parent-consent', label: 'Consentimento dos pais (< 16)' },
]

async function load() {
  loading.value = true
  try {
    const [aiRes, ageRes] = await Promise.allSettled([
      api.get('/admin/moderation/ai-config'),
      api.get('/admin/moderation/age-config'),
    ])
    if (aiRes.status === 'fulfilled') ai.value = aiRes.value.data
    if (ageRes.status === 'fulfilled') ageVerif.value = ageRes.value.data
  } finally {
    loading.value = false
  }
}

async function saveAi() {
  saving.value = true
  try {
    await api.put('/admin/moderation/ai-config', ai.value)
    toast.success('Configuração de IA salva')
  } catch {
    toast.error('Erro ao salvar configuração')
  } finally {
    saving.value = false
  }
}

async function saveAgeVerif() {
  saving.value = true
  try {
    await api.put('/admin/moderation/age-config', ageVerif.value)
    toast.success('Configuração de verificação de idade salva')
  } catch {
    toast.error('Erro ao salvar configuração')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <!-- AI Moderation -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>Moderação via IA</CardTitle>
            <CardDescription class="mt-1">Configure o provedor de IA para moderação automática de conteúdo.</CardDescription>
          </div>
          <Switch v-model="ai.enabled" />
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label>Provedor</Label>
            <Select v-model="ai.provider" :options="providerOptions" :disabled="!ai.enabled" />
          </div>
          <div v-if="availableModels.length" class="space-y-1.5">
            <Label>Modelo</Label>
            <Select v-model="ai.model" :options="availableModels" :disabled="!ai.enabled" placeholder="Selecione o modelo" />
          </div>
          <div v-if="showApiKey" class="space-y-1.5 sm:col-span-2">
            <Label>API Key</Label>
            <Input v-model="ai.apiKey" type="password" placeholder="sk-..." :disabled="!ai.enabled" />
            <p class="text-xs text-slate-500">Armazenada criptografada. Nunca exposta no frontend.</p>
          </div>
          <div v-if="showEndpoint" class="space-y-1.5 sm:col-span-2">
            <Label>Endpoint (POST)</Label>
            <Input v-model="ai.endpoint" placeholder="https://meu-modelo.internal/moderate" :disabled="!ai.enabled" />
            <p class="text-xs text-slate-500">Deve aceitar <code class="font-mono bg-slate-100 px-1 rounded">{"content": "...", "type": "text|image|video"}</code> e retornar <code class="font-mono bg-slate-100 px-1 rounded">{"score": 0.0-1.0, "labels": []}</code></p>
          </div>
        </div>

        <Separator />

        <div>
          <p class="mb-3 text-sm font-medium text-slate-700">O que moderar</p>
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <Switch v-model="ai.moderateText" :disabled="!ai.enabled || ai.provider === 'none'" />
              <span class="text-sm">Texto</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <Switch v-model="ai.moderateImages" :disabled="!ai.enabled || ai.provider === 'none'" />
              <span class="text-sm">Imagens</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <Switch v-model="ai.moderateVideos" :disabled="!ai.enabled || ai.provider === 'none'" />
              <span class="text-sm">Vídeos</span>
            </label>
          </div>
        </div>

        <Separator />

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label>Threshold — Texto (0.0 a 1.0)</Label>
            <Input v-model.number="ai.textThreshold" type="number" min="0" max="1" step="0.05" :disabled="!ai.enabled" />
          </div>
          <div class="space-y-1.5">
            <Label>Threshold — Imagens (0.0 a 1.0)</Label>
            <Input v-model.number="ai.imageThreshold" type="number" min="0" max="1" step="0.05" :disabled="!ai.enabled" />
          </div>
        </div>

        <Separator />

        <div>
          <p class="mb-3 text-sm font-medium text-slate-700">Ações automáticas</p>
          <div class="space-y-2">
            <label class="flex items-center gap-3 cursor-pointer">
              <Switch v-model="ai.autoRemove" :disabled="!ai.enabled" />
              <div>
                <p class="text-sm font-medium">Remover automaticamente</p>
                <p class="text-xs text-slate-500">Remove o conteúdo sem revisão humana quando score acima do threshold</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <Switch v-model="ai.autoFlag" :disabled="!ai.enabled" />
              <div>
                <p class="text-sm font-medium">Sinalizar para revisão</p>
                <p class="text-xs text-slate-500">Cria uma denúncia automática para revisão pelos moderadores</p>
              </div>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
              <Switch v-model="ai.notifyModerators" :disabled="!ai.enabled" />
              <div>
                <p class="text-sm font-medium">Notificar moderadores</p>
                <p class="text-xs text-slate-500">Envia notificação aos moderadores quando conteúdo é sinalizado</p>
              </div>
            </label>
          </div>
        </div>

        <div class="flex justify-end">
          <Button @click="saveAi" :disabled="saving || loading">
            <Save class="h-4 w-4" />
            {{ saving ? 'Salvando...' : 'Salvar configuração de IA' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Age Verification -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>Verificação de Idade</CardTitle>
            <CardDescription class="mt-1">Plataforma 16+. Configure como verificar a idade dos usuários.</CardDescription>
          </div>
          <Switch v-model="ageVerif.enabled" />
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label>Idade mínima</Label>
            <Input v-model.number="ageVerif.minimumAge" type="number" min="13" max="21" :disabled="!ageVerif.enabled" />
          </div>
          <div class="space-y-1.5">
            <Label>Método de verificação</Label>
            <Select v-model="ageVerif.method" :options="ageMethodOptions" :disabled="!ageVerif.enabled" />
          </div>
        </div>

        <label class="flex items-center gap-3 cursor-pointer">
          <Switch v-model="ageVerif.requireVerification" :disabled="!ageVerif.enabled" />
          <div>
            <p class="text-sm font-medium">Exigir verificação obrigatória no cadastro</p>
            <p class="text-xs text-slate-500">Sem verificação = só autodeclaração (mais comum, menor custo)</p>
          </div>
        </label>

        <div class="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <div class="flex gap-2">
            <Info class="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div class="text-xs text-blue-700">
              <p><strong>Recomendação de custo:</strong> Autodeclaração é gratuita e suficiente para conformidade básica.
              Verificação por documento (ex: Stripe Identity ~$1.5/verificação) é ideal para maior segurança.
              Verificação por cartão de crédito requer conta de pagamento mas pode ser feita sem custo extra.</p>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <Button @click="saveAgeVerif" :disabled="saving">
            <Save class="h-4 w-4" />
            {{ saving ? 'Salvando...' : 'Salvar verificação de idade' }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
