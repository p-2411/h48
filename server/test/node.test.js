import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { nodeHandler } from '../src/node.js';

async function serve(handle) {
  const server = createServer(nodeHandler(handle));
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('a Node request reaches the app as a Web Request, body and headers intact', async () => {
  let seen;
  const { base, close } = await serve(async request => {
    seen = { method: request.method, url: request.url, auth: request.headers.get('authorization'), body: await request.text() };
    return new Response('ok', { status: 201, headers: { 'x-test': 'yes' } });
  });
  const response = await fetch(`${base}/v1/responses`, { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{"a":1}' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test'), 'yes');
  assert.equal(await response.text(), 'ok');
  assert.deepEqual(seen, { method: 'POST', url: `${base}/v1/responses`, auth: 'Bearer t', body: '{"a":1}' });
  await close();
});

test('the path Vercel rewrites into ?path= is put back', async () => {
  let url;
  const { base, close } = await serve(async request => ((url = request.url), new Response('')));
  await fetch(`${base}/api/index?path=duet/me`);
  assert.equal(url, `${base}/v1/duet/me`);
  await close();
});

test('binary bodies pass both ways unchanged', async () => {
  const { base, close } = await serve(async request => new Response(await request.arrayBuffer()));
  const bytes = new Uint8Array([0, 255, 1, 254, 128]);
  const response = await fetch(`${base}/v1/audio/speech`, { method: 'POST', body: bytes });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  await close();
});

test('a body over 4.5 MB is refused with 413', async () => {
  const { base, close } = await serve(async () => new Response('never'));
  const response = await fetch(`${base}/v1/audio/transcriptions`, { method: 'POST', body: new Uint8Array(4_600_000) });
  assert.equal(response.status, 413);
  await close();
});
