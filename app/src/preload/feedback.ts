// Feedback to the Duet team (src/main/feedback.ts).
import { invoke } from './invoke'

export const feedbackApi = {
  /** Sends feedback; `details` false leaves out the app's version and the system. */
  send: (feedback: { message: string; replyTo: boolean; details: boolean; place?: string }) =>
    invoke<{ sent: ('server' | 'sentry' | 'email')[] }>('duet:send-feedback', feedback)
}
