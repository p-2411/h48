// Sets up the learner's account and Duet's server when this build has sign-in (a WorkOS client
// id, MAIN_VITE_WORKOS_CLIENT_ID at build time). Without one, or in development with a key in
// app/.env.local, Duet reaches OpenAI as before and no account is made.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAuthKit } from '@workos/authkit-electron'
import { app } from 'electron'
import { setDuetServer } from '../ai/access'
import { dataFolder } from '../data-folder'
import { Account, type CreateAuthKit } from '.'
import { deviceId, hardwareId } from './device'
import { DuetServer } from './server'

const API_URL = 'https://api.useduet.io/v1'

/** A computer whose hardware id can't be read gets a random id, kept in Duet's data folder. */
function fallbackId(): string {
  const file = join(dataFolder(app.getPath('appData')), 'device-id')
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    const id = randomUUID()
    try {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, id)
    } catch {
      // Not kept: a new id next time.
    }
    return id
  }
}

export function setupAccount(
  onSecondInstance: () => void,
  env: NodeJS.ProcessEnv = process.env
): { account?: Account; server?: DuetServer } {
  const clientId = import.meta.env.MAIN_VITE_WORKOS_CLIENT_ID || env.DUET_WORKOS_CLIENT_ID
  // A development key goes straight to OpenAI (ai/access.ts), unless DUET_API_URL asks for a server.
  if (!clientId || (env.OPENAI_API_KEY && !env.DUET_API_URL)) return {}
  const account = new Account({
    clientId,
    createAuthKit: createAuthKit as unknown as CreateAuthKit,
    onSecondInstance
  })
  const server = new DuetServer({
    baseURL: env.DUET_API_URL || API_URL,
    token: () => account.token(),
    device: async () => deviceId((await hardwareId()) ?? fallbackId())
  })
  setDuetServer({ apiKey: 'duet', baseURL: server.baseURL, fetch: server.openAIFetch })
  return { account, server }
}
