import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, unlink, mkdtemp, readFile, rm } from 'node:fs/promises'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

export type VideoMetadata = {
  durationMs: number | null
  width: number | null
  height: number | null
}

async function withTempFile<T>(
  buffer: Buffer,
  ext: string,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'video-'))
  const file = join(dir, `input.${ext}`)
  await writeFile(file, buffer)
  try {
    return await fn(file)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function getVideoMetadata(buffer: Buffer, ext: string): Promise<VideoMetadata> {
  return withTempFile(buffer, ext, (path) =>
    new Promise<VideoMetadata>((resolve) => {
      ffmpeg.ffprobe(path, (err, data) => {
        if (err || !data) return resolve({ durationMs: null, width: null, height: null })
        const stream = data.streams.find(s => s.codec_type === 'video')
        const durationSec = data.format.duration ?? stream?.duration
        resolve({
          durationMs: typeof durationSec === 'number' && isFinite(durationSec)
            ? Math.round(durationSec * 1000)
            : null,
          width: stream?.width ?? null,
          height: stream?.height ?? null,
        })
      })
    }),
  )
}

/**
 * Extrai 1 frame em ~1s do vídeo, escala pra largura máxima de 480px,
 * retorna o buffer JPEG. Não usa webp porque o ffmpeg do installer não tem libwebp consistentemente.
 */
export async function extractThumbnail(buffer: Buffer, ext: string): Promise<Buffer | null> {
  return withTempFile(buffer, ext, async (inputPath) => {
    const outputPath = `${inputPath}.thumb.jpg`
    return new Promise<Buffer | null>((resolve) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['1'],
          filename: 'thumb.jpg',
          folder: outputPath.replace(/\/[^/]+$/, ''),
          size: '480x?',
        })
        .on('end', async () => {
          try {
            const generated = join(outputPath.replace(/\/[^/]+$/, ''), 'thumb.jpg')
            const buf = await readFile(generated)
            await unlink(generated).catch(() => {})
            resolve(buf)
          } catch {
            resolve(null)
          }
        })
        .on('error', () => resolve(null))
    })
  })
}
