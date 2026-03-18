/**
 * @file overview
 * Main entrypoint for the MeshMargin Bun server.
 * Handles HTTP requests, routes to API modules, and serves
 * the compiled frontend React application from `apps/web/dist`.
 */

import { migrate } from 'db';
import { handleAuthRequest } from './api/auth';
import { handleProductsRequest } from './api/products';

await migrate();

export default {
  port: Number(process.env.PORT) || 31415,

  async fetch(req: Request) {
    const url = new URL(req.url);

    // Handle CORS for local dev
    if (req.method === 'OPTIONS') {
      return new Response('Departed', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (url.pathname.startsWith('/api/auth')) {
      const authRes = await handleAuthRequest(req, url);
      if (authRes) return authRes;
    }

    if (url.pathname.startsWith('/api/products')) {
      const productsRes = await handleProductsRequest(req, url);
      if (productsRes) return productsRes;
    }

    // Serve static assets — path is relative to this file, not process cwd
    const webDist = `${import.meta.dir}/../../web/dist`;
    const staticFilePath = `${webDist}${url.pathname === '/' ? '/index.html' : url.pathname}`;
    const file = Bun.file(staticFilePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // Fallback to index.html for client-side routing
    return new Response(Bun.file(`${webDist}/index.html`));
  },
};

console.log(`Listening on http://localhost:${Number(process.env.PORT) || 31415}`);
