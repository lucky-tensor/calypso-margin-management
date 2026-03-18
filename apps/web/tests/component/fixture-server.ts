import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { Product, ProductProperties } from 'core';

type FixtureState = {
  products?: Product[];
  [key: string]: unknown;
};
type FixtureStore = Record<string, FixtureState>;

function loadState(path: string): FixtureStore {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FixtureStore;
  } catch {
    return {};
  }
}

function saveState(path: string, store: FixtureStore): void {
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export async function handleFixtureRequest(req: Request, statePath: string): Promise<Response> {
  const url = new URL(req.url);
  const store = loadState(statePath);
  const fixtureId = url.searchParams.get('fixtureId') ?? 'default';
  const state: FixtureState = (store[fixtureId] as FixtureState) ?? {};

  // Fixture control endpoints
  if (url.pathname === '/fixture/state' && req.method === 'PUT') {
    const body = await req.json();
    store[body.fixtureId ?? 'default'] = body.state;
    saveState(statePath, store);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth stub - always authenticated
  if (url.pathname === '/api/auth/me') {
    return new Response(JSON.stringify({ user: { id: 'test-user', username: 'test' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /api/products
  if (url.pathname === '/api/products' && req.method === 'GET') {
    const products = state.products ?? [];
    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /api/products
  if (url.pathname === '/api/products' && req.method === 'POST') {
    const body = await req.json();

    // Basic validation mirroring server
    if (!body.name) {
      return new Response(JSON.stringify({ error: 'Missing required field: name' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const products = state.products ?? [];
    const newProduct: Product = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      properties: {
        name: body.name,
        sku: body.sku ?? '',
        material: body.material ?? '',
        width_inches: body.width_inches ?? 0,
        length_inches: body.length_inches ?? 0,
        weight_per_sqft: body.weight_per_sqft ?? 0,
        cost_per_each: body.cost_per_each ?? null,
        cost_per_linft: body.cost_per_linft ?? null,
        cost_per_sqft: body.cost_per_sqft ?? null,
        primary_cost_basis: body.primary_cost_basis ?? 'each',
        margin_target: body.margin_target ?? 25,
        margin_floor: body.margin_floor ?? 15,
      } as ProductProperties,
    };

    products.push(newProduct);
    state.products = products;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(newProduct), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PATCH /api/products/:id
  const patchMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const productId = patchMatch[1];
    const products = state.products ?? [];
    const index = products.findIndex((p) => p.id === productId);

    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const existing = products[index];
    const merged: ProductProperties = { ...existing.properties, ...body };
    products[index] = { ...existing, properties: merged };
    state.products = products;
    store[fixtureId] = state;
    saveState(statePath, store);

    return new Response(JSON.stringify(products[index]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ error: `Unhandled fixture route ${req.method} ${url.pathname}` }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
