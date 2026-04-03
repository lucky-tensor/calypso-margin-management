/**
 * @file overview
 * Main entrypoint for the MeshMargin Bun server.
 * Handles HTTP requests, routes to API modules, and serves
 * the compiled frontend React application from `apps/web/dist`.
 *
 * Security hardening (issue #129):
 * - JWT_SECRET must be set in the environment before the server binds.
 *   The process exits with code 1 if the variable is absent or empty so that
 *   the server never starts with an insecure fallback secret in production.
 */

// Fail-fast guard: must run before any module that uses JWT is imported so
// that the check fires before the server binds to a port.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'FATAL: JWT_SECRET environment variable is not set. ' +
        'Set it to a strong random secret before starting the server.',
    );
    process.exit(1);
  }
  process.env.JWT_SECRET = crypto.randomUUID();
  console.warn('WARNING: JWT_SECRET not set — using a random secret for this session. Sessions will not survive a server restart.');
}

import { migrate, seed, sql } from 'db';
import { handleAuthRequest, getCorsHeaders } from './api/auth';
import { handleProductsRequest } from './api/products';
import { handleOrdersRequest } from './api/orders';
import { handleInventoryRequest } from './api/inventory';
import { handleUsersRequest } from './api/users';

await migrate();
await seed(sql);

export default {
  port: Number(process.env.PORT) || 31415,

  async fetch(req: Request) {
    const url = new URL(req.url);

    // Handle CORS preflight — delegate to auth helper so origin allowlist applies
    if (req.method === 'OPTIONS') {
      const corsHeaders = getCorsHeaders(req);
      return new Response('Departed', {
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
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

    if (url.pathname.startsWith('/api/orders')) {
      const ordersRes = await handleOrdersRequest(req, url);
      if (ordersRes) return ordersRes;
    }

    if (url.pathname.startsWith('/api/inventory')) {
      const inventoryRes = await handleInventoryRequest(req, url);
      if (inventoryRes) return inventoryRes;
    }

    if (url.pathname.startsWith('/api/users')) {
      const usersRes = await handleUsersRequest(req, url);
      if (usersRes) return usersRes;
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
