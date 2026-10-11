// A local dashboard of everyone on the Duet waitlist. Runs on this computer only; it is not part of
// the deployed site (Vercel serves app/ and api/, never scripts/).
// Run:  npm run dashboard   then open http://localhost:4400
// Reads DATABASE_URL from .env.local (written by `vercel env pull`).
import http from 'node:http';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('No DATABASE_URL. From waitlist/, run: npx vercel@63.1.2 env pull .env.local --environment=production');
  process.exit(1);
}
const sql = neon(url);
const PORT = Number(process.env.PORT) || 4400;
const LOCAL_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

const signups = () => sql`
  select email, coalesce(source, '') as source, created_at
  from waitlist_signups
  order by created_at desc`;

const csvCell = value => `"${String(value).replaceAll('"', '""')}"`;

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waitlist, Duet</title>
<style>
:root{color-scheme:dark;--bg:#000;--fg:#fff;--fg-2:#d6d6d6;--text-2:#a6a6a6;--text-3:#767676;--line:#1f1f1f;--line-2:#2c2c2c;--frame:#0b0e11;--blue:#4da3ff;--orange:#ff9f0a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:400 15px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:960px;margin:0 auto;padding:48px 24px 64px}
h1{margin:0;font-weight:400;font-size:40px;letter-spacing:-.03em;line-height:1.05}
.meta{margin:10px 0 28px;color:var(--text-2)}
.meta b{color:var(--fg);font-weight:500}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
input{flex:1;min-width:220px;padding:10px 14px;border:1px solid var(--line-2);border-radius:999px;background:rgba(255,255,255,.04);color:var(--fg);font:inherit;outline:0}
input:focus{border-color:rgba(255,255,255,.4)}
button,a.button{padding:9px 16px;border:1px solid var(--line-2);border-radius:999px;background:none;color:var(--fg-2);font:inherit;text-decoration:none;cursor:pointer}
button:hover,a.button:hover{border-color:#5a5a5a;color:var(--fg)}
button.primary{background:#fff;border-color:#fff;color:#000;font-weight:500}
table{width:100%;border-collapse:collapse;border:1px solid var(--line-2);border-radius:8px;overflow:hidden;background:var(--frame)}
th,td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--line)}
th{font-weight:400;font-size:13px;color:var(--text-3)}
tr:last-child td{border-bottom:0}
td.email{color:var(--fg);word-break:break-all}
td.source span{font-size:13px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.06);color:var(--text-2)}
td.source span.dock{color:var(--blue);background:rgba(77,163,255,.12)}
td.source span.closing{color:var(--orange);background:rgba(255,159,10,.12)}
td.when{color:var(--text-2);white-space:nowrap;font-variant-numeric:tabular-nums}
.empty{padding:40px 16px;text-align:center;color:var(--text-3)}
.note{margin-top:14px;font-size:13px;color:var(--text-3)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:10px 16px;border:1px solid var(--line-2);border-radius:8px;background:#141414;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:1}
</style>
</head>
<body>
<main>
  <h1>Waitlist</h1>
  <p class="meta"><b id="total">…</b> people signed up · <span id="today">…</span> in the last 24 hours</p>
  <div class="bar">
    <input id="search" type="search" placeholder="Search emails" aria-label="Search emails">
    <button class="primary" id="copy" type="button">Copy all emails</button>
    <a class="button" href="/signups.csv" download>Download CSV</a>
    <button id="refresh" type="button">Refresh</button>
  </div>
  <table>
    <thead><tr><th>Email</th><th>Form</th><th>Joined</th></tr></thead>
    <tbody id="rows"><tr><td class="empty" colspan="3">Loading…</td></tr></tbody>
  </table>
  <p class="note">Refreshes every 30 seconds. Updated <span id="updated">never</span>.</p>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
const rowsEl = document.getElementById('rows');
const search = document.getElementById('search');
const toast = document.getElementById('toast');
let all = [];
const say = text => { toast.textContent = text; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), 2200); };
const when = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const cell = (text, cls) => { const td = document.createElement('td'); td.className = cls; td.textContent = text; return td; };
const render = () => {
  const term = search.value.trim().toLowerCase();
  const shown = term ? all.filter(row => row.email.toLowerCase().includes(term)) : all;
  if (!shown.length) {
    rowsEl.innerHTML = '';
    const tr = document.createElement('tr');
    const td = cell(all.length ? 'No emails match.' : 'Nobody yet.', 'empty');
    td.colSpan = 3;
    tr.append(td);
    rowsEl.append(tr);
    return;
  }
  rowsEl.replaceChildren(...shown.map(row => {
    const tr = document.createElement('tr');
    const source = document.createElement('td');
    source.className = 'source';
    const tag = document.createElement('span');
    tag.className = row.source;
    tag.textContent = row.source === 'dock' ? 'Sticky bar' : row.source === 'closing' ? 'Bottom section' : (row.source || 'Unknown');
    source.append(tag);
    tr.append(cell(row.email, 'email'), source, cell(when(row.created_at), 'when'));
    return tr;
  }));
};
const load = async () => {
  try {
    const response = await fetch('/signups.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status);
    all = await response.json();
    const day = Date.now() - 864e5;
    document.getElementById('total').textContent = all.length;
    document.getElementById('today').textContent = all.filter(row => new Date(row.created_at) > day).length;
    document.getElementById('updated').textContent = new Date().toLocaleTimeString();
    render();
  } catch {
    say('Couldn’t reach the database. Is the dashboard still running?');
  }
};
search.addEventListener('input', render);
document.getElementById('refresh').addEventListener('click', load);
document.getElementById('copy').addEventListener('click', async () => {
  const term = search.value.trim().toLowerCase();
  const emails = (term ? all.filter(row => row.email.toLowerCase().includes(term)) : all).map(row => row.email);
  try { await navigator.clipboard.writeText(emails.join('\\n')); say(emails.length + ' emails copied.'); }
  catch { say('Couldn’t copy. Use Download CSV instead.'); }
});
load();
setInterval(load, 30000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  // Only answer requests addressed to this machine, so another site can't read the list
  // through a DNS trick.
  if (!LOCAL_HOSTS.has(req.headers.host || '')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const path = req.url.split('?')[0];
  try {
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(PAGE);
    } else if (path === '/signups.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(await signups()));
    } else if (path === '/signups.csv') {
      const rows = await signups();
      const lines = ['email,form,joined', ...rows.map(row => [row.email, row.source, new Date(row.created_at).toISOString()].map(csvCell).join(','))];
      const stamp = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="duet-waitlist-${stamp}.csv"`,
        'Cache-Control': 'no-store'
      });
      res.end(lines.join('\n') + '\n');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Database error');
  }
});

server.on('error', error => {
  if (error.code !== 'EADDRINUSE') throw error;
  console.log(`The dashboard is already running → http://localhost:${PORT}`);
  console.log(`To start another copy, pick a different port: PORT=4401 npm run dashboard`);
  process.exit(0);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Waitlist dashboard → http://localhost:${PORT}`);
});
