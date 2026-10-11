import type { DuetApi } from './index'

declare global {
  interface Window {
    duet: DuetApi
  }
}
