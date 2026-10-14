// Payments (piece D): Stripe Checkout to become Paid, the customer portal to change or cancel, and
// the webhook that sets the plan from the subscription (spec section 13).
import { HttpError } from './errors.js';
import { json } from './respond.js';

const SITE = 'https://useduet.io';

function stripeOf(ctx) {
  if (!ctx.deps.stripe) throw new HttpError(503, 'billing', 'Payments are not set up yet.');
  return ctx.deps.stripe;
}

export async function checkout(ctx) {
  const stripe = stripeOf(ctx);
  if (ctx.user.plan === 'paid') throw new HttpError(409, 'already_paid', 'This account is already on Duet Paid.');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: ctx.deps.stripePrice, quantity: 1 }],
    client_reference_id: ctx.user.id,
    ...(ctx.user.stripe_customer
      ? { customer: ctx.user.stripe_customer }
      : ctx.user.email
        ? { customer_email: ctx.user.email }
        : {}),
    subscription_data: { metadata: { duet_user: ctx.user.id } },
    success_url: `${SITE}/?upgraded=1`,
    cancel_url: `${SITE}/`
  });
  return json({ url: session.url });
}

export async function portal(ctx) {
  const stripe = stripeOf(ctx);
  if (!ctx.user.stripe_customer) throw new HttpError(409, 'no_customer', 'This account has no payments yet.');
  const session = await stripe.billingPortal.sessions.create({ customer: ctx.user.stripe_customer, return_url: `${SITE}/` });
  return json({ url: session.url });
}

const PAYING = new Set(['active', 'trialing']);
const seconds = value => (Number.isFinite(value) ? new Date(value * 1000) : null);

/** Sets the plan from a subscription: Paid while it is active or trialing, else Free. */
async function applySubscription(db, subscription, userId) {
  const item = subscription.items?.data?.[0];
  const start = seconds(subscription.current_period_start ?? item?.current_period_start);
  const end = seconds(subscription.current_period_end ?? item?.current_period_end);
  const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const user = userId ?? subscription.metadata?.duet_user;
  const paying = PAYING.has(subscription.status);
  // A subscription that is not paying only changes the user while it is their current one, so the
  // end of an old subscription never undoes a newer one.
  await db.query(
    `update users set plan = $2, stripe_customer = $3, stripe_subscription = $4, period_start = $5, period_end = $6
     where (id = $1::text or ($1::text is null and stripe_customer = $3))
       and ($7::boolean or stripe_subscription is null or stripe_subscription = $4)`,
    [user ?? null, paying ? 'paid' : 'free', customer, subscription.id, start, end, paying]
  );
}

export async function webhook(deps, db, request) {
  if (!deps.stripe || !deps.stripeWebhookSecret) throw new HttpError(503, 'billing', 'Payments are not set up yet.');
  const payload = await request.text();
  let event;
  try {
    event = deps.stripeLib.webhooks.constructEvent(payload, request.headers.get('stripe-signature') ?? '', deps.stripeWebhookSecret);
  } catch {
    throw new HttpError(400, 'signature', 'The signature does not match.');
  }
  const object = event.data?.object ?? {};
  if (event.type === 'checkout.session.completed' && object.subscription) {
    const id = typeof object.subscription === 'string' ? object.subscription : object.subscription.id;
    await applySubscription(db, await deps.stripe.subscriptions.retrieve(id), object.client_reference_id ?? null);
  } else if (event.type === 'customer.subscription.deleted') {
    await applySubscription(db, object, null);
  } else if (event.type?.startsWith('customer.subscription.') && object.id) {
    // Stripe may deliver events out of order: read the subscription as it is now, not as the event
    // saw it (an older "created … incomplete" must not undo a payment already applied).
    await applySubscription(db, await deps.stripe.subscriptions.retrieve(object.id), null);
  }
  return json({ received: true });
}
