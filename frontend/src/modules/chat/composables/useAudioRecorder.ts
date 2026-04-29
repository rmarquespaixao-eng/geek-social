import { ref, onBeforeUnmount } from 'vue'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'preview' | 'uploading' | 'error'

export interface UseAudioRecorderOptions {
  maxMs: number
  peakBuckets: number
}

export function useAudioRecorder(opts: UseAudioRecorderOptions) {
  const state = ref<RecorderState>('idle')
  const elapsedMs = ref(0)
  const recordedBlob = ref<Blob | null>(null)
  const durationMs = ref<number | null>(null)
  const peaks = ref<number[] | null>(null)
  const errorCode = ref<string | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: BlobPart[] = []
  let timerId: ReturnType<typeof setInterval> | null = null
  let startTs = 0
  let mimeType = ''

  function pickMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
    }
    return ''
  }

  async function start() {
    if (state.value !== 'idle') return
    state.value = 'requesting'
    errorCode.value = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e: any) {
      state.value = 'error'
      errorCode.value =
        e?.name === 'NotAllowedError' ? 'PERMISSION_DENIED' :
        e?.name === 'NotFoundError' ? 'NO_DEVICE' :
        'UNKNOWN'
      cleanup()
      return
    }

    const chosen = pickMimeType()
    mimeType = chosen
    chunks = []
    mediaRecorder = chosen
      ? new MediaRecorder(stream, { mimeType: chosen })
      : new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => { void finalize() }
    mediaRecorder.start()

    startTs = performance.now()
    elapsedMs.value = 0
    state.value = 'recording'
    timerId = setInterval(() => {
      elapsedMs.value = Math.floor(performance.now() - startTs)
      if (elapsedMs.value >= opts.maxMs) void stop()
    }, 100)
  }

  async function stop() {
    if (state.value !== 'recording' || !mediaRecorder) return
    if (timerId) { clearInterval(timerId); timerId = null }
    if (mediaRecorder.state === 'recording') mediaRecorder.stop()
    // restante em onstop -> finalize()
  }

  async function finalize() {
    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
    chunks = []
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
    }

    let buffer: AudioBuffer
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx = new Ctx() as AudioContext
      const arrayBuf = await blob.arrayBuffer()
      buffer = await ctx.decodeAudioData(arrayBuf.slice(0))
      void ctx.close()
    } catch {
      state.value = 'error'
      errorCode.value = 'DECODE_FAILED'
      cleanup()
      return
    }

    const computedPeaks = computePeaks(buffer.getChannelData(0), opts.peakBuckets)
    recordedBlob.value = blob
    durationMs.value = Math.max(1, Math.floor(buffer.duration * 1000))
    peaks.value = computedPeaks
    state.value = 'preview'
  }

  function discard() {
    cleanup()
    recordedBlob.value = null
    durationMs.value = null
    peaks.value = null
    elapsedMs.value = 0
    errorCode.value = null
    state.value = 'idle'
  }

  function cleanup() {
    if (timerId) { clearInterval(timerId); timerId = null }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop() } catch { /* ignore */ }
    }
    mediaRecorder = null
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
    }
    chunks = []
  }

  onBeforeUnmount(() => cleanup())

  return { state, elapsedMs, recordedBlob, durationMs, peaks, errorCode, start, stop, discard }
}

function computePeaks(samples: Float32Array, buckets: number): number[] {
  if (samples.length === 0) return new Array(buckets).fill(0)
  const bucketSize = Math.max(1, Math.floor(samples.length / buckets))
  const rms: number[] = []
  for (let i = 0; i < buckets; i++) {
    const start = i * bucketSize
    const end = Math.min(start + bucketSize, samples.length)
    let sumSq = 0
    for (let j = start; j < end; j++) sumSq += samples[j] * samples[j]
    rms.push(Math.sqrt(sumSq / Math.max(1, end - start)))
  }
  const max = Math.max(...rms, 1e-9)
  return rms.map((v) => Math.min(1, Math.max(0, v / max)))
}

export function isRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}
