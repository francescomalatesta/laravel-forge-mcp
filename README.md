# Laravel Forge MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for the [Laravel Forge API](https://laravel.com/forge/docs/api-reference/introduction). It lets AI assistants (Claude Code, Claude Desktop, Cursor, …) inspect and manage your Forge organizations, servers, sites and deployments.

> This is an unofficial, community project. It is not affiliated with or endorsed by Laravel.

> **Status: early development.** The foundations are in place and the first tools are available. Coverage of the Forge API grows tool by tool; run `npm run coverage:api` for the current numbers.

## Design goals

- **Complete, measurably.** Built from the official Forge OpenAPI spec (`spec/forge.openapi.json`). Every tool declares the API operations it covers, so coverage is a number checked in CI, not a promise.
- **Designed for models, not generated 1:1.** Tools have focused descriptions, concise outputs by default, structured output schemas and errors that say what to do next.
- **Safe by default.** Toolsets limit what is exposed, read-only mode removes every write tool, secrets (`.env`, credentials) require an explicit opt-in, and every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, …) so clients can ask for confirmation.

## Requirements

- Node.js 22.12 or newer
- A Forge API token (Forge → Account settings → API tokens). Grant only the permissions you need.

## Installation

The server runs with `npx`, no installation needed.

### Claude Code

```bash
claude mcp add laravel-forge \
  -e FORGE_API_TOKEN=your-token \
  -e FORGE_ORGANIZATION=your-org-slug \
  -- npx -y @francescomalatesta/laravel-forge-mcp
```

### Claude Desktop, Cursor and other clients

```json
{
  "mcpServers": {
    "laravel-forge": {
      "command": "npx",
      "args": ["-y", "@francescomalatesta/laravel-forge-mcp"],
      "env": {
        "FORGE_API_TOKEN": "your-token",
        "FORGE_ORGANIZATION": "your-org-slug"
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/francescomalatesta/laravel-forge-mcp.git
cd laravel-forge-mcp
npm ci
npm run build
# then use "command": "node", "args": ["/absolute/path/to/laravel-forge-mcp/dist/index.js"]
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `FORGE_API_TOKEN` | — (required) | Forge API token. |
| `FORGE_ORGANIZATION` | — | Default organization slug, so tools don't need an `organization` argument. |
| `FORGE_TOOLSETS` | `default` | Comma-separated toolsets to enable. `default` = `core,sites,deployments`; `all` enables everything. Example: `default,databases`. |
| `FORGE_READ_ONLY` | `false` | Register read-only tools only. |
| `FORGE_ALLOW_SECRETS` | `false` | Register tools that return secrets (`.env` contents, credentials, keys). |
| `FORGE_API_URL` | `https://forge.laravel.com/api` | API base URL. |
| `FORGE_TIMEOUT_MS` | `30000` | Per-request timeout. |
| `FORGE_MAX_RETRIES` | `2` | Retries for rate limits (429) and transient errors. |

### Tools

| Tool | Toolset | Description |
|---|---|---|
| `forge_list_organizations` | core | List accessible organizations and their slugs |
| `forge_list_servers` | core | List servers with filters, sorting and pagination |
| `forge_get_server` | core | Every detail of a server |
| `forge_list_sites` | core | Sites of an organization, a server or all organizations, with latest deployment |
| `forge_get_site` | core | Every detail of a site, including its server |
| `forge_list_server_events` | core | Operations Forge ran on a server or across the organization |
| `forge_get_server_event` | core | An event with the output of its script |
| `forge_list_deployments` | deployments | Deployments of a site or of every site on a server |
| `forge_get_deployment` | deployments | A deployment with the end of its log |
| `forge_get_deployment_status` | deployments | Whether a deployment is running |
| `forge_deploy_site` | deployments | Deploy a site and (optionally) wait for the result, with progress notifications |
| `forge_reset_deployment_state` | deployments | Unblock a stuck deployment |
| `forge_get_deployment_script` | deployments | Read the deployment script |
| `forge_update_deployment_script` | deployments | Replace the deployment script |
| `forge_set_push_to_deploy` | deployments | Enable or disable push to deploy |
| `forge_list_deployment_webhooks` | deployments | Webhooks notified after deployments |
| `forge_create_deployment_webhook` | deployments | Add a deployment webhook |
| `forge_delete_deployment_webhook` | deployments | Remove a deployment webhook |
| `forge_get_deploy_key` | deployments | The site's SSH deploy key |
| `forge_create_deploy_key` | deployments | Create a deploy key |
| `forge_delete_deploy_key` | deployments | Remove the deploy key |
| `forge_get_deploy_hook` 🔑 | deployments | The deployment trigger URL |
| `forge_regenerate_deploy_hook` 🔑 | deployments | Generate a new deployment trigger URL |

🔑 Returns secrets: registered only when `FORGE_ALLOW_SECRETS=true`. Secret fields returned by other tools (e.g. a site's `deployment_url`) are hidden unless secrets are allowed.

## Development

```bash
npm run dev            # run from source (tsx)
npm run inspect        # open the MCP Inspector against the server
npm test               # unit and tool tests (mocked Forge API)
npm run typecheck
npm run coverage:api   # API coverage per tag; add `-- --missing` to list uncovered operations
npm run spec:update    # download the latest spec and regenerate types
npm run check          # typecheck + tests + coverage
```

Every push to `main` with `feat:` or `fix:` commits is released to npm automatically, based on [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): see [RELEASING.md](RELEASING.md).

### Project structure

```
spec/forge.openapi.json      Official Forge OpenAPI spec (source of truth)
src/
  index.ts                   CLI entry point (stdio transport)
  server.ts                  Builds the McpServer and registers tools
  config.ts                  Environment configuration
  forge/
    client.ts                HTTP client: auth, timeouts, retries, error mapping
    jsonapi.ts               Flattens JSON:API documents
    query.ts, path.ts        Query string (filter[], sort, page[]) and path helpers
    schema.gen.ts            Types generated from the spec (do not edit)
  tools/
    define-tool.ts           Tool definition contract
    registry.ts              All tools + selection by toolset / read-only / secrets
    toolsets.ts              Toolset catalogue
    errors.ts                Actionable error messages
    shared/                  Shared input/output schemas
    <resource>/<tool>.ts     One file per tool
scripts/                     Coverage report and spec update
tests/                       Vitest suites; fixtures are validated against the spec
```

Tests never call the real API: fixtures in `tests/fixtures` are validated against the response schemas in the OpenAPI spec, so they cannot silently drift from what Forge documents.

## License

[MIT](LICENSE)
