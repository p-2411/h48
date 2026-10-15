// The device id Duet's server uses for its one-free-tier-per-computer rule: a hash of the
// computer's hardware id, so it stays the same when Duet is removed and installed again, and the
// hardware id itself never leaves the computer. A changed app can send another id; the rule only
// stops casual abuse (spec 2026-10-13-usage-caps-design.md, section 3).
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile as readFileAsync } from 'node:fs/promises'
import { promisify } from 'node:util'

type Run = (command: string, args: string[]) => Promise<string>
type Read = (path: string) => Promise<string>

// Asynchronous, so reading the id never holds up Electron's main process.
const run: Run = async (command, args) =>
  (await promisify(execFile)(command, args, { encoding: 'utf8', timeout: 5000 })).stdout
const read: Read = (path) => readFileAsync(path, 'utf8')

/** The computer's hardware id: macOS IOPlatformUUID, Windows MachineGuid, Linux machine-id. */
export async function hardwareId(
  platform: NodeJS.Platform = process.platform,
  runCommand: Run = run,
  readFile: Read = read
): Promise<string | undefined> {
  try {
    if (platform === 'darwin')
      return /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(
        await runCommand('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])
      )?.[1]
    if (platform === 'win32')
      return /MachineGuid\s+REG_SZ\s+(\S+)/.exec(
        await runCommand('reg', [
          'query',
          'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
          '/v',
          'MachineGuid'
        ])
      )?.[1]
    return (await readFile('/etc/machine-id')).trim() || undefined
  } catch {
    return undefined
  }
}

export function deviceId(raw: string): string {
  return createHash('sha256').update(`duet-device:${raw}`).digest('hex')
}
