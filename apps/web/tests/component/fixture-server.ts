import { existsSync, readFileSync } from 'fs';

type FixtureState = Record<string, unknown>;
type FixtureStore = Record<string, FixtureState>;

function loadState(path: string): FixtureStore {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FixtureStore;
  } catch {
    return {};
  }
}

export async function handleFixtureRequest(req: Request, statePath: string): Promise<Response> {
  const url = new URL(req.url);
  const store = loadState(statePath);
  const fixtureId = url.searchParams.get('fixtureId') ?? 'default';
  void (store[fixtureId] ?? {});

  // Placeholder — add product/order fixture routes as component tests are built
  return new Response(
    JSON.stringify({ error: `Unhandled fixture route ${req.method} ${url.pathname}` }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
