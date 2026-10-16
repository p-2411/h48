// The app's real collaborators, from the environment Vercel gives the function. Secrets stay in
// the environment: nothing here prints or logs them.
import Stripe from 'stripe';
import { workosKeySet } from './auth.js';
import { database } from './db.js';

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function productionDeps(env = process.env) {
  const openaiKey = required(env, 'OPENAI_API_KEY');
  const clientId = required(env, 'WORKOS_CLIENT_ID');
  if (!env.DATABASE_URL && !env.POSTGRES_URL) throw new Error('DATABASE_URL is not set');
  const stripeReady = env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeReady ? new Stripe(env.STRIPE_SECRET_KEY) : null;
  const workosKey = env.WORKOS_API_KEY;
  const discordWebhook = env.DISCORD_FEEDBACK_WEBHOOK;
  return {
    db: database(env),
    keySet: workosKeySet(clientId),
    openaiKey,
    fetchOpenAI: (url, init) => fetch(url, init),
    now: () => new Date(),
    cronSecret: env.CRON_SECRET ?? '',
    stripe,
    stripeLib: stripe,
    stripePrice: env.STRIPE_PRICE_ID ?? '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    // Feedback goes on to the team's Discord channel through this webhook (kept here, never in the app).
    postDiscord: discordWebhook
      ? async message => {
          const response = await fetch(discordWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(message),
            signal: AbortSignal.timeout(5000)
          });
          return response.ok;
        }
      : null,
    fetchEmail: workosKey
      ? async userId => {
          const response = await fetch(`https://api.workos.com/user_management/users/${encodeURIComponent(userId)}`, {
            headers: { authorization: `Bearer ${workosKey}` },
            // WorkOS slow or out of reach must not hold the learner's request.
            signal: AbortSignal.timeout(3000)
          });
          return response.ok ? (await response.json()).email : undefined;
        }
      : null
  };
}
