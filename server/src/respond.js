// Small helpers for answering.
import { HttpError } from './errors.js';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

/** An error reply. `x-should-retry: false` stops the app's OpenAI SDK retrying a refusal (it would
 * retry a 409 or a 5xx on its own); OpenAI's own errors pass through with OpenAI's headers. */
export function fail(error) {
  const response = json(error.body(), error.status);
  response.headers.set('x-should-retry', 'false');
  return response;
}

/** The cap reached: 402 with which cap and when it resets. The app's OpenAI SDK reads `error.code`. */
export const capReached = (cap, resetsAt, extra = {}) =>
  new HttpError(402, 'usage_cap', cap === 'hours' ? 'Hours used up' : 'Credits used up', {
    cap,
    resets_at: resetsAt.toISOString(),
    ...extra
  });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'body', 'The body must be JSON.');
  }
}
