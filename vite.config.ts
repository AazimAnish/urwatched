import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { connectionResponse } from './server/connection.ts';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
const productionHeaders = Object.fromEntries(config.headers[0].headers.map((header: { key: string; value: string }) => [header.key, header.value]));

export default defineConfig({
  base: './',
  server: { headers: { ...productionHeaders, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ws://127.0.0.1:*; base-uri 'none'; object-src 'none'" } },
  preview: { headers: productionHeaders },
  build: { target: 'es2022' },
  plugins: [svelte(), tailwindcss(), {
    name: 'local-connection-endpoint',
    configureServer(server) { server.middlewares.use(connectionMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(connectionMiddleware); },
  }],
});

async function connectionMiddleware(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) {
  if (req.url?.split('?')[0] !== '/api/connection') return next();
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const response = await connectionResponse(new Request('http://localhost/api/connection', { method: req.method, headers }), false);
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  void response.text().then(body => res.end(body));
}
