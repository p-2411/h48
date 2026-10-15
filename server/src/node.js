// Runs the app (a Web Request → Response function) behind Node's http (req, res), as Vercel's Node
// functions and dev.js give it. vercel.json rewrites /v1/<path> to /api/index?path=<path>, so the
// path is put back here.
const MOST_BYTES = 4_500_000; // Vercel's own request limit.

class TooLarge extends Error {}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  // Past the limit the rest is read and dropped: leaving the loop early would destroy the socket
  // before the 413 reply could go out.
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MOST_BYTES) chunks.push(chunk);
  }
  if (size > MOST_BYTES) throw new TooLarge();
  return Buffer.concat(chunks);
}

function urlOf(req) {
  const proto = req.headers['x-forwarded-proto'] ?? 'http';
  const url = new URL(req.url, `${proto}://${req.headers.host ?? 'localhost'}`);
  const rewritten = url.searchParams.get('path');
  if (url.pathname.startsWith('/api/') && rewritten !== null) {
    url.searchParams.delete('path');
    url.pathname = `/v1/${rewritten}`;
  }
  return url;
}

function headersOf(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const one of value) headers.append(name, one);
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export function nodeHandler(handle) {
  return async (req, res) => {
    let response;
    try {
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      response = await handle(new Request(urlOf(req), { method: req.method, headers: headersOf(req), body }));
    } catch (error) {
      const status = error instanceof TooLarge ? 413 : 500;
      response = Response.json({ error: { type: 'duet', code: status === 413 ? 'size' : 'server', message: 'Request failed.' } }, { status });
    }
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
