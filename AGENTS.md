# AGENTS.md

## Cursor Cloud specific instructions

This is a single **Next.js 15** application (v0 Platform API Demo) — no microservices, no Docker.

### Quick reference

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (Turbopack, port 3000) |
| Lint | `pnpm lint` |
| Format check | `pnpm format:check` |
| Format fix | `pnpm format` |
| Build | `pnpm build` |

See `README.md` for full docs.

### Environment variables

The app requires a `V0_API_KEY` secret (from v0.dev/settings) in `.env.local`. Without it, the app shows an "API Key Required" dialog and all API routes return 401. The `KV_REST_API_URL`/`KV_REST_API_TOKEN` vars are optional (rate limiting only — disabled when absent).

If `V0_API_KEY` is provided as a Cursor secret, regenerate `.env.local` before starting the dev server:

```bash
echo "V0_API_KEY=${V0_API_KEY}" > .env.local
```

### Gotchas

- **pnpm build scripts**: The project uses `pnpm.onlyBuiltDependencies` in `package.json` to allow native build scripts for `@tailwindcss/oxide`, `sharp`, and `unrs-resolver`. If new native dependencies are added, they must be listed there or `pnpm install` will silently skip their builds.
- **ESLint**: The codebase has pre-existing lint errors (`@typescript-eslint/no-explicit-any`, `react/no-unescaped-entities`, etc.). `next.config.ts` has `eslint.ignoreDuringBuilds: true` so `pnpm build` succeeds. `pnpm lint` will still report them.
- **No test suite**: There are no automated tests configured. Validation is via lint, format check, build, and manual testing.
- **Prettier formatting**: 10 files have pre-existing format issues. `pnpm format:check` exits non-zero on the current codebase.
