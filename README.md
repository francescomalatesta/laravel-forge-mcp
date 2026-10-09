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
| `forge_create_site` | sites | Create a site (optionally with repository and database) and wait until it is installed |
| `forge_create_balanced_site` | sites | Create a site on a load balancer |
| `forge_update_site` | sites | Change PHP version, type, directories, branch, push to deploy, release retention |
| `forge_update_site_repository` | sites | Switch source control provider, repository or branch |
| `forge_delete_site` | sites | Delete a site |
| `forge_set_site_env_vars` | sites | Set or remove .env variables without exposing the file |
| `forge_get_site_environment` 🔑 | sites | Read the whole .env file |
| `forge_update_site_environment` 🔑 | sites | Replace the whole .env file |
| `forge_get_site_nginx_config` | sites | Read the Nginx configuration of a site or one of its domains |
| `forge_update_site_nginx_config` | sites | Replace the Nginx configuration of a site or one of its domains |
| `forge_get_site_log` | sites | End of the application, Nginx access or Nginx error log |
| `forge_clear_site_log` | sites | Empty a site log |
| `forge_get_site_healthcheck` | sites | Healthcheck URL used after zero-downtime deployments |
| `forge_update_site_healthcheck` | sites | Set or remove the healthcheck URL |
| `forge_list_domains` | sites | Domains of a site with status and www redirection |
| `forge_get_domain` | sites | A domain with the DNS records to configure |
| `forge_add_domain` | sites | Add a domain (alias) and wait until it is enabled |
| `forge_update_domain` | sites | Change www redirection and wildcard subdomains |
| `forge_run_domain_action` | sites | Enable, disable or mark a domain as primary |
| `forge_delete_domain` | sites | Remove a domain |
| `forge_list_certificates` | sites | SSL certificates of a site or of one domain |
| `forge_get_certificate` | sites | A certificate, or the active one |
| `forge_create_certificate` | sites | Let's Encrypt, existing, CSR or cloned certificate, waiting until installed |
| `forge_run_certificate_action` | sites | Activate or deactivate a certificate |
| `forge_delete_certificate` | sites | Delete a certificate |
| `forge_run_service_action` | servers | Restart or stop Nginx, MySQL, Postgres, Redis, Supervisor; restart or reload PHP-FPM |
| `forge_run_server_action` | servers | Reboot or power-cycle a server |
| `forge_get_server_log` | servers | End of a server log (Nginx, PHP-FPM, MySQL, cron, daemons) |
| `forge_clear_server_log` | servers | Empty a server log |
| `forge_update_server` | servers | Rename, change IP addresses, timezone or tags |
| `forge_get_server_network` | servers | Servers that can reach each other on the private network |
| `forge_update_server_network` | servers | Set the server network |
| `forge_list_archived_servers` | servers | Archived servers |
| `forge_archive_server` | servers | Archive a server (Forge stops managing it) |
| `forge_unarchive_server` | servers | Restore an archived server |
| `forge_delete_server` | servers | Delete a server (optionally keeping it at the provider) |
| `forge_list_php_versions` | servers | Installed PHP versions |
| `forge_get_php_settings` | servers | Default CLI and site versions, upload and execution limits, OPcache |
| `forge_install_php_version` | servers | Install a PHP version (optionally as default) and wait until installed |
| `forge_upgrade_php_version` | servers | Update a PHP version to its latest patch release |
| `forge_uninstall_php_version` | servers | Uninstall a PHP version |
| `forge_set_default_php_version` | servers | Default PHP version for the CLI or for new sites |
| `forge_update_php_limits` | servers | Max upload size and max execution time |
| `forge_set_php_opcache` | servers | Enable or disable OPcache |
| `forge_get_php_config` | servers | FPM or CLI php.ini, or the FPM pool configuration |
| `forge_update_php_config` | servers | Replace a PHP configuration file |
| `forge_list_databases` | databases | Database schemas on a server |
| `forge_create_database` | databases | Create a database (optionally with a user) and wait until installed |
| `forge_delete_database` | databases | Drop a database |
| `forge_sync_databases` | databases | Import databases created outside Forge |
| `forge_list_database_users` | databases | Database users on a server |
| `forge_create_database_user` | databases | Create a user with access to databases (by ID or name) |
| `forge_update_database_user` | databases | Change a user's password or databases |
| `forge_delete_database_user` | databases | Delete a database user |
| `forge_update_database_root_password` | databases | Change the database root password |
| `forge_list_backup_configurations` | databases | Scheduled database backups: storage, schedule, retention, next run |
| `forge_create_backup_configuration` | databases | Schedule backups of databases (by ID or name) to a storage provider |
| `forge_update_backup_configuration` | databases | Change storage, databases, schedule or retention |
| `forge_delete_backup_configuration` | databases | Stop scheduled backups |
| `forge_list_backups` | databases | Backups of a configuration with status and size |
| `forge_create_backup` | databases | Run a backup now and wait until it finishes |
| `forge_delete_backup` | databases | Delete a backup |
| `forge_restore_backup` | databases | Restore a database from a backup (overwrites it) |
| `forge_list_storage_providers` | storage | S3, Spaces, Hetzner, OVH, Scaleway or S3-compatible storage for backups |
| `forge_create_storage_provider` | storage | Add a storage provider (credentials are never returned) |
| `forge_update_storage_provider` | storage | Change name, location or credentials |
| `forge_delete_storage_provider` | storage | Remove a storage provider that no backup uses |
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
| `forge_list_scheduled_jobs` | jobs | Scheduled jobs (cron) of a server or a site |
| `forge_get_scheduled_job` | jobs | A scheduled job with the output of its last run |
| `forge_create_scheduled_job` | jobs | Schedule a command, optionally with a heartbeat |
| `forge_delete_scheduled_job` | jobs | Remove a scheduled job |
| `forge_list_background_processes` | jobs | Supervisor daemons (queue workers, …) and their status |
| `forge_get_background_process_log` | jobs | End of a background process log |
| `forge_create_background_process` | jobs | Run a command permanently under Supervisor and wait until it is running |
| `forge_update_background_process` | jobs | Rename or replace the Supervisor configuration |
| `forge_run_background_process_action` | jobs | Start, stop or restart a background process, or empty its log |
| `forge_delete_background_process` | jobs | Stop and remove a background process |
| `forge_get_site_integrations` | integrations | Horizon, Octane, Reverb, Pulse, Inertia SSR, scheduler and maintenance mode status |
| `forge_enable_site_integration` | integrations | Enable an integration (e.g. put the site in maintenance mode) and wait until it is active |
| `forge_disable_site_integration` | integrations | Disable an integration (e.g. bring the site back up) |
| `forge_run_site_command` | commands | Run a command in the site directory and return its output |
| `forge_list_site_commands` | commands | Commands run on a site with status and exit code |
| `forge_get_site_command` | commands | A command run with the end of its output |
| `forge_delete_site_command` | commands | Remove a command run from the history |

🔑 Reads or replaces secrets: registered only when `FORGE_ALLOW_SECRETS=true`. Secret fields returned by other tools (e.g. a site's `deployment_url`) are hidden unless secrets are allowed.

The `commands` toolset runs arbitrary shell commands with the privileges of the site user: enable it explicitly (e.g. `FORGE_TOOLSETS=default,commands`) only when you need it. Note that `all` includes it.

### Background operations

Forge runs most changes in the background. Tools that start one say so in their description and return a `status`: `completed` or `failed` when they waited for the result, `in_progress` if it was still running at the timeout, `queued` when they returned right away. `check_with` names the tool that shows the current state. By default these tools wait for the outcome (sending progress notifications); pass `wait: false` to return immediately, or tune `timeout_seconds`.

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
