// The learner's Duet account: sign-in with WorkOS AuthKit (the system browser, PKCE, back to Duet
// by the duet:// link), through @workos/authkit-electron. The SDK keeps the session encrypted with
// the OS keychain (safeStorage) and needs only the client id, no secret.
//
// The SDK registers IPC handlers for windows and tells every window about sign-ins. Duet gives it an
// ipcMain and a window list of its own instead, so its handlers stay in main (no page can ask for
// the token) and its news comes here; Duet's pages ask main (connect.ts). Events: 'change' (the user
// or null), 'error' (a sign-in that failed, as a sentence).
import { EventEmitter } from 'node:events'

export type AccountUser = { email: string }

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type Handler = (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>> | IpcResult<unknown>

/** The part of @workos/authkit-electron's createAuthKit that Duet uses (injected, for tests). */
export type CreateAuthKit = (
  config: { clientId: string; redirectUri: string },
  options: {
    ipcMain: { handle(channel: string, handler: Handler): void; removeHandler(channel: string): void }
    browserWindow: { getAllWindows(): Array<{ webContents: { isDestroyed(): boolean; send(channel: string, ...args: unknown[]): void } }> }
    onSecondInstance?: () => void
  }
) => { registerProtocol(): void; cleanup(): void }

export const REDIRECT_URI = 'duet://auth/callback'

export class Account extends EventEmitter {
  private readonly handlers = new Map<string, Handler>()
  private readonly authKit: ReturnType<CreateAuthKit>

  constructor(options: { clientId: string; createAuthKit: CreateAuthKit; onSecondInstance?: () => void }) {
    super()
    const handlers = this.handlers
    // The SDK's "windows": one stand-in that hands its news to this account.
    const listener = {
      webContents: {
        isDestroyed: () => false,
        send: (channel: string, payload: unknown) => this.heard(channel, payload)
      }
    }
    this.authKit = options.createAuthKit(
      { clientId: options.clientId, redirectUri: REDIRECT_URI },
      {
        ipcMain: {
          handle: (channel, handler) => void handlers.set(channel, handler),
          removeHandler: (channel) => void handlers.delete(channel)
        },
        browserWindow: { getAllWindows: () => [listener] },
        onSecondInstance: options.onSecondInstance
      }
    )
  }

  /** Makes Duet the duet:// handler. Call inside app.whenReady(). */
  register(): void {
    this.authKit.registerProtocol()
  }

  cleanup(): void {
    this.authKit.cleanup()
  }

  private heard(channel: string, payload: unknown): void {
    if (channel === 'authkit:auth-changed') this.emit('change', userOf(payload))
    else if (channel === 'authkit:auth-error') this.emit('error', 'Sign-in didn’t finish. Try again.')
  }

  private async call<T>(channel: string, ...args: unknown[]): Promise<T | undefined> {
    const handler = this.handlers.get(channel)
    if (!handler) return undefined
    try {
      const result = await handler({}, ...args)
      return result.ok ? (result.data as T) : undefined
    } catch {
      return undefined
    }
  }

  /** The current access token (refreshed by the SDK when it has expired), or null when signed out. */
  async token(): Promise<string | null> {
    return (await this.call<string | null>('authkit:get-access-token')) ?? null
  }

  async user(): Promise<AccountUser | null> {
    return userOf(await this.call('authkit:get-user'))
  }

  /** Opens the sign-in page in the browser; the account's 'change' says when it is done. */
  async signIn(): Promise<void> {
    await this.call('authkit:sign-in')
  }

  async signOut(): Promise<void> {
    await this.call('authkit:sign-out')
    this.emit('change', null)
  }
}

function userOf(payload: unknown): AccountUser | null {
  const user = (payload as { user?: { email?: unknown } } | undefined)?.user
  return user && typeof user.email === 'string' ? { email: user.email } : null
}
