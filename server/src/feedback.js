// Feedback from the app: kept in the database first, then forwarded to the team's Discord channel
// (a webhook only the server knows, DISCORD_FEEDBACK_WEBHOOK). One that can't be forwarded yet (no
// webhook, or Discord down) waits, and the cron (and the next feedback) tries again.
import { HttpError } from './errors.js';
import { json, readJson } from './respond.js';

const MAX_MESSAGE = 4000;
const MAX_ERRORS = 10;
const MAX_ERROR_LENGTH = 300;
// One learner's feedback, at most this many an hour.
const PER_HOUR = 10;
// Given up on after this many failed tries (a bad webhook shouldn't be tried forever).
const MAX_TRIES = 10;
const BATCH = 20;

const short = (value, length) => (typeof value === 'string' ? value.trim().slice(0, length) : undefined);

/** What the app may send with the message: its version, the system, the language, recent errors. */
function cleanDetails(raw) {
  const details = raw && typeof raw === 'object' ? raw : {};
  const errors = Array.isArray(details.errors)
    ? details.errors.map(error => short(error, MAX_ERROR_LENGTH)).filter(Boolean).slice(0, MAX_ERRORS)
    : [];
  return {
    version: short(details.version, 40),
    platform: short(details.platform, 40),
    language: short(details.language, 10),
    place: short(details.place, 40),
    ...(errors.length && { errors })
  };
}

/** POST /v1/duet/feedback { message, details?, replyTo? }: kept, then sent on to Discord. */
export async function sendFeedback(ctx, request) {
  const { db, user, now } = ctx;
  const body = await readJson(request);
  const message = short(body?.message, MAX_MESSAGE);
  if (!message) throw new HttpError(400, 'feedback', 'Write something first.');
  const [{ count }] = await db.query(
    `select count(*)::int as count from feedback where user_id = $1 and created_at > $2`,
    [user.id, new Date(now.getTime() - 3_600_000)]
  );
  if (count >= PER_HOUR) throw new HttpError(429, 'feedback_limit', 'That’s a lot of feedback at once. Try again in a bit.');
  const details = cleanDetails(body?.details);
  // The learner's email only when they ask to be answered (and the server knows it).
  const replyTo = body?.replyTo === true && user.email ? user.email : null;
  const [row] = await db.query(
    `insert into feedback (user_id, message, details, reply_to, plan, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
    [user.id, message, JSON.stringify(details), replyTo, user.plan, now]
  );
  // Sent on now when it can be; a failure here never fails the learner's feedback.
  await forwardFeedback(ctx.deps, now).catch(() => undefined);
  return json({ ok: true, id: String(row.id) });
}

/** The Discord message for one piece of feedback. Mentions in the learner's text are never pinged. */
export function discordMessage(row) {
  const details = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details ?? {});
  const fields = [
    row.reply_to ? { name: 'Reply to', value: row.reply_to, inline: true } : { name: 'From', value: `a ${row.plan} user (no reply asked)`, inline: true },
    details.version && { name: 'Duet', value: details.version, inline: true },
    details.platform && { name: 'System', value: details.platform, inline: true },
    details.language && { name: 'Learning', value: details.language, inline: true },
    details.place && { name: 'Sent from', value: details.place, inline: true },
    details.errors?.length && { name: 'Recent errors', value: '```\n' + details.errors.join('\n').slice(0, 1000) + '\n```' }
  ].filter(Boolean);
  return {
    username: 'Duet feedback',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'New feedback',
        description: row.message.slice(0, 4000),
        color: 0xe0583a,
        fields,
        timestamp: new Date(row.created_at).toISOString(),
        footer: { text: `#${row.id}` }
      }
    ]
  };
}

/** Sends waiting feedback to Discord, oldest first. Without a webhook nothing is tried. */
export async function forwardFeedback(deps, now) {
  if (!deps.postDiscord) return 0;
  const rows = await deps.db.query(
    `select * from feedback where forwarded_at is null and tries < $1 order by id limit $2`,
    [MAX_TRIES, BATCH]
  );
  let sent = 0;
  for (const row of rows) {
    let ok = false;
    try {
      ok = await deps.postDiscord(discordMessage(row));
    } catch {
      ok = false;
    }
    if (ok) {
      sent++;
      await deps.db.query(`update feedback set forwarded_at = $2 where id = $1`, [row.id, now]);
    } else {
      await deps.db.query(`update feedback set tries = tries + 1 where id = $1`, [row.id]);
      // Discord is down or refusing: the rest wait for the next try.
      break;
    }
  }
  return sent;
}
