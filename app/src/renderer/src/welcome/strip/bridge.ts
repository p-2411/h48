// The messages between the first run's page (welcome/strip.ts) and the real caption strip framed on
// its video (welcome/strip/main.tsx). The strip calls window.duet as it does in its own window; in the
// frame, each call goes to the page as a message, and the page's demo stand-in answers it, so nothing
// the learner does on the demo strip reaches the app.

/** From the strip: a call, a subscription (an `on…` function), or its end. */
export type FromStrip =
  | { duetStrip: 'call'; id: number; path: string[]; args: unknown[] }
  | { duetStrip: 'on'; sub: number; path: string[] }
  | { duetStrip: 'off'; sub: number }

/** To the strip: a call's answer, or an event for a subscription. */
export type ToStrip =
  | { duetStrip: 'result'; id: number; ok: true; value: unknown }
  | { duetStrip: 'result'; id: number; ok: false; error: string }
  | { duetStrip: 'event'; sub: number; value: unknown }

export const isBridgeMessage = (data: unknown): data is { duetStrip: string } =>
  typeof data === 'object' && data !== null && 'duetStrip' in data
