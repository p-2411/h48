// A picture card's picture, in the order the learner is offered them: a still from the video at the
// word's moment (only after they agree, in the page), a picture of their own, one Duet generates, or
// none. Pictures are kept small (a JPEG data URL on the card).
import {
  desktopCapturer,
  dialog,
  nativeImage,
  type BrowserWindow,
  type NativeImage
} from 'electron'
import { readFile } from 'fs/promises'
import { openAIAccess, openAIClient } from '../ai/access'

// Pictures are kept at most this wide.
const WIDTH = 640
const QUALITY = 78

function small(image: NativeImage): string {
  if (image.isEmpty()) throw new Error('That picture could not be read.')
  const { width } = image.getSize()
  const sized = width > WIDTH ? image.resize({ width: WIDTH, quality: 'good' }) : image
  return `data:image/jpeg;base64,${sized.toJPEG(QUALITY).toString('base64')}`
}

/** A picture the learner picks from their files; undefined if they cancel. */
export async function uploadPicture(parent: BrowserWindow | null): Promise<string | undefined> {
  const options = {
    filters: [{ name: 'Pictures', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    properties: ['openFile' as const]
  }
  const result = await (parent
    ? dialog.showOpenDialog(parent, options)
    : dialog.showOpenDialog(options))
  const path = result.filePaths[0]
  if (result.canceled || !path) return undefined
  return small(nativeImage.createFromBuffer(await readFile(path)))
}

/** A still of the browser window the video is playing in (found by the video's title, which the tab
 * shows). The page asks the learner first; on macOS the system may ask for Screen Recording too. */
export async function captureStill(title: string): Promise<string> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1280, height: 800 }
  })
  const wanted = title.trim().toLocaleLowerCase().slice(0, 40)
  const source = sources.find((item) => wanted && item.name.toLocaleLowerCase().includes(wanted))
  if (!source || source.thumbnail.isEmpty())
    throw new Error(
      'Duet couldn’t find the video’s window. Keep the video open in your browser and try again.'
    )
  return small(source.thumbnail)
}

/** A simple picture of the word's meaning, drawn by the image model. */
export async function generatePicture(
  word: string,
  meaning: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  // Duet's server has no picture route yet (it meters only text, voice and transcription), so
  // pictures are made only with a development key; signed-in builds offer a still or the learner's own.
  const access = openAIAccess(env)
  if (!access || access.baseURL)
    throw new Error('Duet can’t make pictures yet. Use a still from the video, or a picture of your own.')
  const result = await openAIClient(access).images.generate({
    model: env.DUET_IMAGE_MODEL || 'gpt-image-1',
    prompt: `A clear, simple illustration of "${meaning}" for a language flashcard. One subject, plain light background, no text, no letters, no words.`,
    size: '1024x1024',
    quality: 'low',
    n: 1
  })
  const data = result.data?.[0]?.b64_json
  if (!data) throw new Error(`Duet couldn’t make a picture for “${word}”. Try again.`)
  return small(nativeImage.createFromBuffer(Buffer.from(data, 'base64')))
}
