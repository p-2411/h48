// The account in the home base (main-process side): its state, and signing in, signing out,
// upgrading and managing the plan. Only the home page may ask. The meters are read from Duet's
// server at sign-in, after a cap reply, when asked (a video starts, Duet comes to the front after
// checkout) and every 5 minutes.
//
// IPC (window.duet.account in src/preload/account.ts):
//   account:get        → AccountState
//   account:sign-in    opens the sign-in page in the browser
//   account:sign-out
//   account:upgrade    opens Stripe Checkout in the browser
//   account:manage     opens the Stripe customer portal
//   account:changed    ← the state changed
import type { EventEmitter } from 'node:events'
import { ipcMain, shell, type WebContents } from 'electron'
import {
  capSentence,
  isCapReached,
  type AccountState,
  type CapReached,
  type Usage
} from '../../shared/usage'
import type { Account } from '.'
import type { DuetServer } from './server'

const REFRESH_MS = 5 * 60_000

type HomeWindow = {
  owns(sender: WebContents | unknown): boolean
  send(channel: string, value: unknown): void
}

/** Opens a page from the server in the browser, only if it is Stripe's. */
async function openStripe(url: unknown): Promise<void> {
  if (typeof url !== 'string' || !/^https:\/\/(checkout|billing)\.stripe\.com\//.test(url))
    throw new Error('Could not open the payment page.')
  await shell.openExternal(url)
}

export function connectAccount({
  account,
  server,
  home
}: {
  account?: EventEmitter & Pick<Account, 'user' | 'signIn' | 'signOut'>
  server?: EventEmitter & Pick<DuetServer, 'request'>
  home: HomeWindow
}): { refresh(): Promise<void>; stop(): void } {
  let user: AccountState['user'] = null
  let usage: Usage | null = null
  // The last cap reached, until it resets or the plan changes.
  let capped: { sentence: string; until: number; plan?: string } | undefined
  let known = false

  const state = (): AccountState => ({
    configured: !!account && !!server,
    user,
    usage,
    capped: capped?.sentence
  })
  const tell = (): void => home.send('account:changed', state())

  async function refresh(): Promise<void> {
    if (!account || !server) return
    user = await account.user()
    usage = user
      ? await server.request<Usage>('/duet/me', undefined, 'GET').catch(() => usage)
      : null
    // A cap is over once it resets, the plan changes (Paid now) or the learner signs out.
    if (
      capped &&
      (!user || Date.now() >= capped.until || (capped.plan && usage && usage.plan !== capped.plan))
    )
      capped = undefined
    known = true
    tell()
  }

  const handle = (channel: string, work: () => unknown): void => {
    ipcMain.handle(channel, async (event: { sender: WebContents }) => {
      if (!home.owns(event.sender)) throw new Error('Not allowed: this is the home page’s.')
      return work()
    })
  }
  handle('account:get', async () => {
    if (!known) await refresh()
    return state()
  })
  handle('account:sign-in', () => account?.signIn())
  handle('account:sign-out', () => account?.signOut())
  handle('account:upgrade', async () => {
    if (!server) throw new Error('Payments are not set up in this build.')
    const { url } = await server.request<{ url: string }>('/duet/billing/checkout', {})
    await openStripe(url)
  })
  handle('account:manage', async () => {
    if (!server) throw new Error('Payments are not set up in this build.')
    const { url } = await server.request<{ url: string }>('/duet/billing/portal', {})
    await openStripe(url)
  })

  account?.on('change', () => void refresh())
  // The server refused the sign-in (a session ended at WorkOS): signed out here too. No request is
  // made, so this can not loop; the next refresh or sign-in reads the account again. No token here
  // is the account's own news ('change'): a refresh that failed offline is not a sign-out.
  server?.on('signed-out', (reason?: string) => {
    if (!user || reason === 'no-token') return
    user = null
    usage = null
    capped = undefined
    tell()
  })
  server?.on('cap', (reached: CapReached) => {
    if (isCapReached(reached))
      capped = {
        sentence: capSentence(reached),
        until: Date.parse(reached.resets_at),
        plan: usage?.plan
      }
    void refresh()
  })
  const timer = account && server ? setInterval(() => void refresh(), REFRESH_MS) : undefined
  timer?.unref?.()

  return { refresh, stop: () => timer && clearInterval(timer) }
}
