// Duet's server (server/ in this repo, at api.useduet.io): the client for its own routes, and the
// fetch the OpenAI SDK uses to reach OpenAI through it. Each request carries the learner's WorkOS
// token (fresh each time: tokens expire within minutes), the device id and, while the learner
// watches, the watch session (watch.ts). The token is never logged.
//
// Events: 'cap' (the server's cap reply: which cap and when it resets) and 'signed-out' ('no-token':
// none here, signed out or a refresh that failed; 'refused': the server refused the sign-in).
import { EventEmitter } from 'node:events'
import { isCapReached, type CapReached } from '../../shared/usage'

export class DuetServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message)
  }
}

type Options = {
  /** The server's /v1 address, e.g. https://api.useduet.io/v1. */
  baseURL: string
  token: () => Promise<string | null>
  /** The device id (device.ts), read once, at the first request. */
  device: () => Promise<string>
  fetch?: typeof fetch
}

const signedOutReply = (): Response =>
  new Response(
    JSON.stringify({ error: { type: 'duet', code: 'signed_out', message: 'Sign in to Duet.' } }),
    {
      status: 401,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'false' }
    }
  )

export class DuetServer extends EventEmitter {
  /** The open watch session, sent with each call (watch.ts keeps it). */
  watchId?: string
  readonly baseURL: string
  private readonly fetchImpl: typeof fetch
  // The watch session being opened, shared by every caller until it is open.
  private opening?: Promise<string | undefined>
  private deviceId?: Promise<string>

  constructor(private readonly options: Options) {
    super()
    this.baseURL = options.baseURL.replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? fetch
  }

  /** Sends a request with the learner's sign-in; signed out, nothing is sent and the reply is a 401. */
  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.options.token()
    if (!token) {
      // No token here: signed out, or the sign-in could not be refreshed (offline for a moment).
      this.emit('signed-out', 'no-token')
      return signedOutReply()
    }
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${token}`)
    this.deviceId ??= this.options.device()
    headers.set('x-duet-device', await this.deviceId)
    if (this.watchId) headers.set('x-duet-watch', this.watchId)
    else headers.delete('x-duet-watch')
    const response = await this.fetchImpl(url, { ...init, headers })
    if (response.status === 402 || response.status === 401) {
      const error = await errorOf(response.clone())
      if (response.status === 402 && isCapReached(error)) this.emit('cap', error)
      if (response.status === 401 && error?.type === 'duet') this.emit('signed-out', 'refused')
    }
    return response
  }

  /** The OpenAI SDK's fetch. A call refused for want of a watch session is sent once more: with the
   * session another call opened meanwhile, or else with one it opens. */
  readonly openAIFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input)
    const sentWith = this.watchId
    const response = await this.send(url, init)
    if (response.status !== 409 || (await errorOf(response.clone()))?.code !== 'watch_required')
      return response
    // Opening another would end the one just opened, and with it the calls sent with it.
    const opened = this.watchId && this.watchId !== sentWith
    if (!opened && !(await this.openWatch())) return response
    return this.send(url, init)
  }

  /** Opens a watch session (ending the server's earlier one). Gives its id, or undefined when refused.
   * Calls at the same moment share one: each new one would end the one before. */
  openWatch(): Promise<string | undefined> {
    this.opening ??= this.startWatch().finally(() => {
      this.opening = undefined
    })
    return this.opening
  }

  private async startWatch(): Promise<string | undefined> {
    try {
      const { id } = await this.request<{ id: string }>('/duet/watch/start', {})
      this.watchId = id
      return id
    } catch {
      return undefined
    }
  }

  forgetWatch(): void {
    this.watchId = undefined
  }

  /** One of Duet's own routes ('/duet/me' and so on): JSON in and out; a refusal throws DuetServerError. */
  async request<T>(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    const response = await this.send(`${this.baseURL}${path}`, {
      method,
      ...(body !== undefined
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : {})
    })
    if (response.ok) return (await response.json()) as T
    const error = await errorOf(response)
    const { code = 'server', message = 'Duet’s server refused this.', ...details } = error ?? {}
    throw new DuetServerError(response.status, String(code), String(message), details)
  }
}

type ServerError = Partial<CapReached> & { type?: string; code?: string; message?: string }

async function errorOf(response: Response): Promise<ServerError | undefined> {
  try {
    return ((await response.json()) as { error?: ServerError }).error
  } catch {
    return undefined
  }
}
