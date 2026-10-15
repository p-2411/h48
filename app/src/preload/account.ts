// The account's bridge to the main process (src/main/account/connect.ts), for the home base: the
// plan and its meters, signing in and out, upgrading and managing the plan. Sign-in itself happens
// in the browser; no token ever reaches a page.
import type { AccountState } from '../shared/usage'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const accountApi = {
  get: () => invoke<AccountState>('account:get'),
  signIn: () => invoke<void>('account:sign-in'),
  signOut: () => invoke<void>('account:sign-out'),
  /** Opens Stripe Checkout in the browser. */
  upgrade: () => invoke<void>('account:upgrade'),
  /** Opens the Stripe customer portal in the browser. */
  manage: () => invoke<void>('account:manage'),
  onChanged: (listener: (state: AccountState) => void) => subscribe('account:changed', listener)
}
