// Small helpers for answering.
import { HttpError } from './errors.js';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

export const fail = error => json(error.body(), error.status);

/** The cap reached: 402 with which cap and when it resets. The app's OpenAI SDK reads `error.code`. */
export const capReached = (cap, resetsAt) =>
  new HttpError(402, 'usage_cap', cap === 'hours' ? 'Hours used up' : 'Credits used up', {
    cap,
    resets_at: resetsAt.toISOString()
  });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'body', 'The body must be JSON.');
  }
}
