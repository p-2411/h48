// The Windows readers carry the hash of the source they were built from (BuildInfo.SourceHash, printed
// by `--source-hash`), so a check can tell when a committed reader in resources/bin is older than its
// source. The .NET Framework compiler can't build byte-identical files, so the files themselves can't
// be compared. Line endings don't count: Git on Windows may check the source out with CRLF.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '..')

/** The Windows readers: their source and the file built from it, relative to the app folder. */
export const WINDOWS_READERS = [
  { source: 'native/windows/CaptionReader.cs', built: 'resources/bin/caption-reader-windows.exe' },
  { source: 'native/windows/AudioReader.cs', built: 'resources/bin/audio-reader-windows.exe' }
]

/** The hash of a reader's source, as compiled into it. */
export function sourceHash(source) {
  const text = readFileSync(resolve(root, source), 'utf8').replace(/\r\n/g, '\n')
  return createHash('sha256').update(text).digest('hex')
}
