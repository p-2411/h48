// The one Vercel function. vercel.json sends every /v1/* request here; src/app.js routes it.
import { createApp } from '../src/app.js';
import { nodeHandler } from '../src/node.js';
import { productionDeps } from '../src/production.js';

let handler;

export default function duet(req, res) {
  handler ??= nodeHandler(createApp(productionDeps()));
  return handler(req, res);
}
