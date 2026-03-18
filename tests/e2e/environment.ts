import type { Subprocess } from 'bun';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { startPostgres, type PgContainer } from '../../packages/db/pg-container';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const SERVER_ENTRY = 'apps/server/src/index.ts';
const SERVER_ENTRY_ABS = join(REPO_ROOT, SERVER_ENTRY);
const SERVER_BASE_PORT = Number(process.env.PORT ?? 31415);
const WORKER_ID = Number(process.env.VITEST_WORKER_ID ?? process.env.VITEST_WORKER ?? 0);
const SERVER_PORT = SERVER_BASE_PORT + WORKER_ID;
const SERVER_READY_TIMEOUT_MS = 20_000;
const BUN_BIN =
  process.env.BUN_BIN ?? (existsSync('/usr/local/bin/bun') ? '/usr/local/bin/bun' : 'bun');

export type E2EEnvironment = {
  pg: PgContainer;
  server: Subprocess;
  baseUrl: string;
  cloneRoot: string;
};

export async function startE2EServer(): Promise<E2EEnvironment> {
  const cloneRoot = join('/tmp', `meshmargin-e2e-${Date.now()}`);
  await cloneRepo(cloneRoot);
  await runBuild();
  const pg = await startPostgres();

  const server = Bun.spawn([BUN_BIN, 'run', SERVER_ENTRY_ABS], {
    cwd: cloneRoot,
    env: {
      ...process.env,
      MESHMARGIN_REPO_ROOT: cloneRoot,
      DATABASE_URL: pg.url,
      PORT: String(SERVER_PORT),
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await waitForServer();

  return {
    pg,
    server,
    baseUrl: `http://localhost:${SERVER_PORT}`,
    cloneRoot,
  };
}

export async function stopE2EServer(context: E2EEnvironment): Promise<void> {
  context.server.kill();
  await context.pg.stop();
  rmSync(context.cloneRoot, { recursive: true, force: true });
}

async function cloneRepo(cloneRoot: string): Promise<void> {
  const clone = Bun.spawnSync(['git', 'clone', REPO_ROOT, cloneRoot], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (clone.exitCode !== 0) {
    throw new Error(
      `Failed to clone repo for E2E test: ${(clone.stderr ?? new Uint8Array()).toString()}`,
    );
  }

  Bun.spawnSync(['git', 'config', 'user.name', 'E2E Test'], {
    cwd: cloneRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  Bun.spawnSync(['git', 'config', 'user.email', 'e2e@example.com'], {
    cwd: cloneRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

async function runBuild(): Promise<void> {
  const build = Bun.spawnSync([BUN_BIN, 'run', '--filter', 'web', 'build'], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (build.exitCode !== 0) {
    throw new Error('Failed to build the web assets.');
  }
}

async function waitForServer(port = SERVER_PORT): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  const base = `http://localhost:${port}`;
  while (Date.now() < deadline) {
    try {
      await fetch(`${base}/api/auth/me`);
      return;
    } catch {
      await Bun.sleep(300);
    }
  }
  throw new Error(`Server at ${base} did not become ready within ${SERVER_READY_TIMEOUT_MS}ms`);
}
