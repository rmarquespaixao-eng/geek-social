<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useViaCep } from '../composables/useViaCep'
import type { EventAddress } from '../types'

const props = defineProps<{
  modelValue: EventAddress
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EventAddress]
}>()

const local = reactive<EventAddress>({ ...props.modelValue })

watch(
  () => props.modelValue,
  (v) => Object.assign(local, v),
  { deep: true },
)

const { loading, error, lookup } = useViaCep()

function emitChange() {
  emit('update:modelValue', { ...local })
}

async function onCepChange() {
  emitChange()
  const r = await lookup(local.cep)
  if (r) {
    local.logradouro = r.logradouro || local.logradouro
    local.bairro = r.bairro || local.bairro
    local.cidade = r.localidade || local.cidade
    local.estado = r.uf || local.estado
    if (r.complemento && !local.complemento) local.complemento = r.complemento
    emitChange()
  }
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-6 gap-3" data-testid="address-fields">
    <label class="md:col-span-2 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">CEP</span>
      <input
        v-model="local.cep"
        @input="onCepChange"
        placeholder="00000-000"
        data-testid="address-cep"
        class="bg-[#252640] text-slate-200 text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <span v-if="loading" class="text-[10px] text-slate-500">Buscando…</span>
      <span v-else-if="error" class="text-[10px] text-red-400">{{ error }}</span>
    </label>
    <label class="md:col-span-4 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Logradouro</span>
      <input
        v-model="local.logradouro"
        @input="emitChange"
        data-testid="address-logradouro"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>
    <label class="md:col-span-2 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Número</span>
      <input
        v-model="local.numero"
        @input="emitChange"
        data-testid="address-numero"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>
    <label class="md:col-span-4 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Complemento (opcional)</span>
      <input
        v-model="local.complemento"
        @input="emitChange"
        data-testid="address-complemento"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>
    <label class="md:col-span-3 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Bairro</span>
      <input
        v-model="local.bairro"
        @input="emitChange"
        data-testid="address-bairro"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>
    <label class="md:col-span-2 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">Cidade</span>
      <input
        v-model="local.cidade"
        @input="emitChange"
        data-testid="address-cidade"
        class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>
    <label class="md:col-span-1 flex flex-col gap-1">
      <span class="text-xs font-semibold text-slate-300">UF</span>
      <input
        v-model="local.estado"
        @input="emitChange"
        maxlength="2"
        data-testid="address-estado"
        class="bg-[#252640] text-slate-200 text-sm font-mono uppercase rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
    </label>
  </div>
</template>
