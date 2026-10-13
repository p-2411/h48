// How Duet reaches OpenAI. In development, a key in app/.env.local goes straight to OpenAI, as before.
// Otherwise every call goes through Duet's server (server/ in this repo), which holds the key and
// meters each learner's use: the client gets the server's address, a placeholder key, and a fetch
// that adds the learner's sign-in (src/main/account/server.ts). A packaged build never reads
// .env.local, so it always uses the server.
import OpenAI, { type ClientOptions } from 'openai'

export type OpenAIAccess = Pick<ClientOptions, 'apiKey' | 'baseURL' | 'fetch'>

let duetServer: OpenAIAccess | undefined

/** Called once at startup (src/main/account/setup.ts) when Duet’s server is set up. */
export function setDuetServer(access: OpenAIAccess | undefined): void {
  duetServer = access
}

/** The development key, unless DUET_API_URL points a development build at a Duet server; else the
 * server. Undefined: neither, so no AI. */
export function openAIAccess(env: NodeJS.ProcessEnv = process.env): OpenAIAccess | undefined {
  if (env.OPENAI_API_KEY && !env.DUET_API_URL) return { apiKey: env.OPENAI_API_KEY }
  return duetServer
}

// One client per access: a new client for each call would set up its connection again.
const clients = new WeakMap<OpenAIAccess, OpenAI>()
const byKey = new Map<string, OpenAI>()

export function openAIClient(access: OpenAIAccess): OpenAI {
  // A development key gives a new object each time it is read, so those clients are kept by key.
  if (!access.baseURL && typeof access.apiKey === 'string') {
    const found = byKey.get(access.apiKey)
    if (found) return found
    const client = new OpenAI(access)
    byKey.set(access.apiKey, client)
    return client
  }
  let client = clients.get(access)
  if (!client) {
    client = new OpenAI(access)
    clients.set(access, client)
  }
  return client
}
