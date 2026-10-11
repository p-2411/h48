import type { DuetApi } from '../shared/types'

declare global {
  interface Window {
    duet: DuetApi
  }
}
