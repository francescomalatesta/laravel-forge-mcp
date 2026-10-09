# laravel-forge-mcp

MCP server for the Laravel Forge API (v2, organization-scoped). TypeScript, `@modelcontextprotocol/sdk`, Zod 4, Vitest.

## Commands

- `npm run check` — typecheck + tests + API coverage. Run before every commit.
- `npm run coverage:api -- --missing` — uncovered Forge operations. Endpoints that duplicate another one (same request and response) are listed with a reason in `scripts/operation-aliases.ts`: tools call only the target and the alias counts as covered. Add an alias only for true duplicates, never to skip work.
- `npm run spec:update` — refresh `spec/forge.openapi.json` and regenerate `src/forge/schema.gen.ts` (never edit it by hand).
- Releases are automatic on push to `main` (see RELEASING.md). Never edit versions in `package.json`, `server.json` or `CHANGELOG.md` release sections by hand.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): they decide the next version. `fix:`/`perf:` → patch, `feat:` → minor, `!` or `BREAKING CHANGE:` → major; `docs:`, `chore:`, `test:`, `ci:`, `refactor:` do not release. Use the tool or resource as scope, e.g. `feat(sites): add forge_list_sites`.

## Adding a tool

1. Find the operation in `spec/forge.openapi.json`: operationId, parameters, `x-permissions`, `x-processingMode`, response schema.
2. Create `src/tools/<resource>/<verb>-<resource>.ts` with `defineTool`:
   - `name`: `forge_<verb>_<resource>` (snake_case).
   - `operations`: the operationIds covered; `permissions`: the spec's `x-permissions`.
   - `readOnly` only for GET operations; set `destructive`, `idempotent`, `exposesSecrets` when relevant.
   - `async: true` when a write operation has `x-processingMode: async`: then follow "Asynchronous operations" below.
   - Inputs: flat, described Zod fields; reuse `organizationInput`, `paginationInput`, `responseFormatInput`. Use `apiPath` for URLs. When the API expects nested objects, keep the inputs flat (prefixed if needed) and build the body in the handler, validating per-variant requirements with `ToolInputError` (see `forge_create_certificate`).
   - Output: `outputSchema` with nullable fields and `z.looseObject`; concise by default.
   - `summary`: one or two sentences, including the next step (e.g. pagination cursor, polling for async operations).
3. Register it in `src/tools/registry.ts` and add it to the README tools table.
4. Test it in `tests/tools/` with `createHarness`. Build mock responses with `specResponse(operationId, status, overrides)` / `specSchema(name, overrides)` from `tests/helpers/spec-fixtures.ts`: they are generated from the spec and validated against it. The harness fails a test that makes a request with no mocked response or leaves mocked responses unused: queue exactly the calls the tool makes, polls included.

## Asynchronous operations

Forge runs most write operations in the background (`x-processingMode: async` in the spec, usually HTTP 202): the request is accepted and the work continues on the server. Every tool covering one follows the same contract, implemented in `src/tools/shared/async.ts` and enforced by `tests/tools/registry.test.ts`:

1. **Declare it**: `async: true` when any non-GET operation of the tool is async in the spec (tests fail if the flag and the spec disagree). The server then appends `ASYNC_NOTE` to the tool description.
2. **Report it**: spread `operationOutput` into the output schema: `status` (`queued` | `in_progress` | `completed` | `failed`) and `check_with` (the read tool that shows the current state). Never redefine these fields.
3. **Follow it** when the outcome is observable through the API and the response does not already contain it:
   - add `...waitInput(seconds)` (`wait`, default true, and `timeout_seconds`; pick a default that fits the operation: 60s for configuration changes, 180s for deployments, longer for provisioning);
   - after the write, call `waitFor({ poll, phase, describe, timeoutSeconds, context: { sleep, progress }, initial? })`, which polls every 5s, sends MCP progress notifications and stops at the timeout;
   - build the result with `outcome(result, { action, checkWith, timeoutSeconds })` (or a resource-specific summary with the same four cases);
   - with `wait: false`, return `queued(action, checkWith)`.
4. **Declare the polled operations** too (`operations` and `permissions`), e.g. the `show` endpoint read while waiting.

How to observe the outcome:

| Operation | `poll` | `phase` |
|---|---|---|
| Create/update a resource with a status field | read the resource (pass the write response as `initial` when it returns one) | `phaseOf(status, { pending: [...transitional], failed: [...] })` |
| Status where only some values mean success | read the resource | `phaseOf(status, { completed: [...], failed: [...] })` |
| Delete | `orGone(() => client.get(path))` | `value === null ? 'completed' : 'pending'` |
| Create without an ID in the response | list the collection, find the new item (e.g. by URL or name) | found ? completed : pending |
| Toggle a setting | read the owning resource | field equals the requested value ? completed : pending |
| Update several settings | read the resource | every requested field the resource exposes matches ? completed : pending; if none is exposed, return `queued` with a hint |
| Replace a file (.env, Nginx config) | read the content back | equals the sent content, ignoring trailing whitespace ? completed : pending |

Transitional status values are listed in the spec enums (e.g. sites: `creating`, `installing`, `removing`; certificates: `verifying`, `creating`, `installing`; databases: `installing`, `removing`). Read errors while waiting never fail the tool: the write already succeeded, so `waitFor` returns `queued` with the reason (`unfollowed`) and `outcome` explains it.

When the outcome cannot be observed through the API (e.g. reboots and service restarts expose no state), return `queued` with `check_with: 'forge_list_server_events'`, where Forge records the result; don't invent a wait condition.

When the async response already carries the final result (e.g. `forge_create_deploy_key` returns the key), set `async: true` and the status fields but skip `wait`. Reference implementations: `forge_deploy_site` (resource status, custom summaries), `forge_create_site` (status with `initial` from the response), `forge_reset_deployment_state` (status endpoint), `forge_set_push_to_deploy` (toggle), `forge_update_site` (several settings), `forge_update_site_nginx_config` (file content), `forge_create_deployment_webhook` (find in list), `forge_delete_deployment_webhook` (wait for 404).

## Conventions

- Prefer consolidating endpoints that differ only by a path segment into one tool with an enum argument.
- Asynchronous operations follow the contract in "Asynchronous operations" above; don't hand-roll polling loops.
- Errors are returned as tool results (`isError`) with actionable messages, never thrown to the client.
- Secret values (tokens, trigger URLs, credentials) are hidden with `redact()` unless `FORGE_ALLOW_SECRETS` is enabled. Tools whose purpose is returning a secret, or replacing a whole secret file (which needs reading it first), set `exposesSecrets`. Prefer an extra tool that changes secrets without returning them (e.g. `forge_set_site_env_vars`).
- Site-scoped tools take `organization`, `server` and `site` (`siteScopeInput`); IDs accept numbers or strings (`idInput`).
- Log only to stderr (`src/logger.ts`): stdout is the stdio protocol channel.
