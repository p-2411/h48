// The daily session's bridge to the main process (src/main/daily).
import type { HomeToday } from '../shared/home'
import type { SessionView } from '../shared/daily'
import { challengeBridge } from './challenges'
import { invoke } from './invoke'

export const dailyApi = {
  plan: () => invoke<SessionView>('daily:plan'),
  ...challengeBridge('daily'),
  /** Ends the session: today is kept only when something was done. */
  done: () => invoke<{ kept: boolean; streak: HomeToday['streak'] }>('daily:done')
}
