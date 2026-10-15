// The server on a local port, with the settings in server/.env.local (never committed). Point a
// dev build of the app at it with DUET_API_URL=http://localhost:8787/v1.
import { createServer } from 'node:http';
import { createApp } from './src/app.js';
import { nodeHandler } from './src/node.js';
import { productionDeps } from './src/production.js';

const port = Number(process.env.PORT || 8787);
createServer(nodeHandler(createApp(productionDeps()))).listen(port, () => {
  console.log(`Duet API on http://localhost:${port}/v1`);
});
