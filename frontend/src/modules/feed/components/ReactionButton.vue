<!-- src/modules/feed/components/ReactionButton.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Zap } from 'lucide-vue-next'
import { reactionsService } from '../services/reactionsService'
import { useFeed } from '../composables/useFeed'

const REACTIONS = [
  { type: 'power_up', emoji: '⚡', label: 'Power Up' },
  { type: 'epic',     emoji: '🔥', label: 'Épico' },
  { type: 'critical', emoji: '💥', label: 'Critical' },
  { type: 'loot',     emoji: '💎', label: 'Loot' },
  { type: 'gg',       emoji: '🏆', label: 'GG' },
] as const

type ReactionType = typeof REACTIONS[number]['type']

const props = defineProps<{
  postId: string
  count: number
  userReaction: string | null
}>()

const feed = useFeed()
const showPicker = ref(false)
const pending = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)

const currentReaction = computed(() =>
  REACTIONS.find(r => r.type === props.userReaction) ?? null
)

function handleOutsideClick(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    showPicker.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))

async function select(type: ReactionType) {
  if (pending.value) return
  showPicker.value = false

  const isSame = props.userReaction === type
  const newType = isSame ? null : type
  const prevReaction = props.userReaction

  pending.value = true
  feed.updatePostReaction(props.postId, newType)

  try {
    if (isSame) {
      await reactionsService.removeReaction(props.postId)
    } else {
      await reactionsService.react(props.postId, type)
    }
  } catch {
    feed.updatePostReaction(props.postId, prevReaction)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="relative" ref="containerRef">
    <!-- Picker popup -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-90 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-90 translate-y-1"
    >
      <div
        v-if="showPicker"
        class="absolute bottom-full left-0 mb-2 flex gap-0.5 bg-[#12132a] border border-slate-700/60 rounded-2xl p-1.5 shadow-2xl z-30"
      >
        <button
          v-for="r in REACTIONS"
          :key="r.type"
          @click.stop="select(r.type)"
          :title="r.label"
          :class="[
            'w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-all duration-100 hover:scale-125 active:scale-110',
            userReaction === r.type
              ? 'bg-amber-500/20 ring-1 ring-amber-500/50'
              : 'hover:bg-slate-700/60',
          ]"
        >
          {{ r.emoji }}
        </button>
      </div>
    </Transition>

    <!-- Botão principal -->
    <button
      @click.stop="showPicker = !showPicker"
      :disabled="pending"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-60"
      :class="userReaction
        ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
        : 'text-slate-400 hover:text-amber-400 hover:bg-amber-400/10'"
    >
      <span v-if="currentReaction" class="text-base leading-none">{{ currentReaction.emoji }}</span>
      <Zap v-else :size="16" />
      <span>{{ count }}</span>
    </button>
  </div>
</template>
