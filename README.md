# MeshMargin

Margin management tool for unit-based industrial sales.

Product documentation lives in [docs/prd.md](docs/prd.md).

## Quick Start

```bash
bun install
bun run dev
```

## Stack

- **Server:** Bun HTTP server (TypeScript)
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Database:** PostgreSQL (property graph model)
- **Monorepo:** Bun workspaces (`apps/server`, `apps/web`, `packages/core`, `packages/db`)

## Scripts

| Command             | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `bun run dev`       | Start dev environment (ephemeral Postgres + API + Vite) |
| `bun run build`     | Build all workspaces                                    |
| `bun run test`      | Run all tests (unit + API + component + E2E)            |
| `bun run test:unit` | Unit tests only                                         |
| `bun run test:api`  | API integration tests (requires Docker)                 |
| `bun run lint`      | ESLint check                                            |
| `bun run format`    | Prettier format                                         |
