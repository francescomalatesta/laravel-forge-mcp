# laravel-forge-mcp

MCP server for the Laravel Forge API (v2, organization-scoped). TypeScript, `@modelcontextprotocol/sdk`, Zod 4, Vitest.

## Commands

- `npm run check` — typecheck + tests + API coverage. Run before every commit.
- `npm run coverage:api -- --missing` — uncovered Forge operations.
- `npm run spec:update` — refresh `spec/forge.openapi.json` and regenerate `src/forge/schema.gen.ts` (never edit it by hand).
- Releases: `npm version <patch|minor|major>` then `git push --follow-tags` (see RELEASING.md). Never edit versions in `package.json`/`server.json` by hand.

## Adding a tool

1. Find the operation in `spec/forge.openapi.json`: operationId, parameters, `x-permissions`, `x-processingMode`, response schema.
2. Create `src/tools/<resource>/<verb>-<resource>.ts` with `defineTool`:
   - `name`: `forge_<verb>_<resource>` (snake_case).
   - `operations`: the operationIds covered; `permissions`: the spec's `x-permissions`.
   - `readOnly` only for GET operations; set `destructive`, `idempotent`, `exposesSecrets` when relevant.
   - Inputs: flat, described Zod fields; reuse `organizationInput`, `paginationInput`, `responseFormatInput`. Use `apiPath` for URLs.
   - Output: `outputSchema` with nullable fields and `z.looseObject`; concise by default.
   - `summary`: one or two sentences, including the next step (e.g. pagination cursor, polling for async operations).
3. Register it in `src/tools/registry.ts` and add it to the README tools table.
4. Add a fixture in `tests/fixtures/` (register it in `tests/fixtures.test.ts`, which validates it against the spec) and a test in `tests/tools/` using `createHarness`.

## Conventions

- Prefer consolidating endpoints that differ only by a path segment into one tool with an enum argument.
- Async operations (`x-processingMode: async`, HTTP 202) must say the work is queued and which tool checks progress.
- Errors are returned as tool results (`isError`) with actionable messages, never thrown to the client.
- Log only to stderr (`src/logger.ts`): stdout is the stdio protocol channel.
