// Speech said once is kept: each word or line Duet says is saved to disk the first time, and played
// from there after that, with no request (and offline). Clips are keyed by the voice, the language,
// word or line, and the text. The oldest go once there are more than MAX_CLIPS.
import { createHash } from 'crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Language } from '../../../shared/types'
import type { AudioClip, TextToSpeech } from './types'

// Change when the voice's instructions change, so clips said the old way are said again.
const STYLE = 'warm-1'
const MAX_CLIPS = 2000
const PRUNE = 200

export class SavedSpeech implements TextToSpeech {
  readonly name: string
  private ready?: Promise<void>

  constructor(
    private readonly speech: TextToSpeech,
    private readonly folder: string,
    /** The model and voice, so a change of either says clips afresh. */
    private readonly variant: string
  ) {
    this.name = speech.name
  }

  async speak(text: string, language: Language, signal?: AbortSignal, as: 'word' | 'line' = 'line'): Promise<AudioClip> {
    const key = createHash('sha256')
      .update([this.variant, STYLE, language, as, text.normalize('NFC').trim()].join('\u0000'))
      .digest('hex')
      .slice(0, 40)
    const file = join(this.folder, `${key}.mp3`)
    try {
      return { data: new Uint8Array(await readFile(file)), mimeType: 'audio/mpeg' }
    } catch {
      /* Not said yet. */
    }
    const clip = await this.speech.speak(text, language, signal, as)
    // Kept only when it's MP3 (what the voice gives); a failure to keep it never fails the speech.
    if (clip.mimeType === 'audio/mpeg') void this.keep(file, clip.data).catch(() => undefined)
    return clip
  }

  private async keep(file: string, data: Uint8Array): Promise<void> {
    this.ready ??= mkdir(this.folder, { recursive: true }).then(() => undefined)
    await this.ready
    await writeFile(file, data)
    const names = (await readdir(this.folder)).filter((name) => name.endsWith('.mp3'))
    if (names.length <= MAX_CLIPS) return
    const aged = await Promise.all(
      names.map(async (name) => ({ name, at: (await stat(join(this.folder, name))).mtimeMs }))
    )
    aged.sort((a, b) => a.at - b.at)
    await Promise.all(aged.slice(0, PRUNE).map(({ name }) => unlink(join(this.folder, name))))
  }
}
