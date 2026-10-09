# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.14.0] - 2026-10-09

### Features

- **teams:** manage teams, members, invitations, sharing and roles ([dffb718](https://github.com/francescomalatesta/laravel-forge-mcp/commit/dffb718092f37a4c8bd8580e3fa6190a16a2af9c))
- **recipes:** manage and run recipes ([4db0ca7](https://github.com/francescomalatesta/laravel-forge-mcp/commit/4db0ca74627ef60b1bf7658e83c6e605bdeeb38d))
- **servers:** create servers ([af522c3](https://github.com/francescomalatesta/laravel-forge-mcp/commit/af522c3196a0cd96155a600966024bee92b53947))
- **providers:** browse providers, credentials and VPCs ([18bfb70](https://github.com/francescomalatesta/laravel-forge-mcp/commit/18bfb70b46a5a242422ff999b934f81ece26ca6b))

### Bug fixes

- send only the query parameters each endpoint declares ([71b3f67](https://github.com/francescomalatesta/laravel-forge-mcp/commit/71b3f67fc8b83f1a67bfe3d0bba9cd5dd7e07103))

## [0.13.0] - 2026-10-09

### Features

- **sites:** manage package credentials and load balancer nodes ([8dc94ce](https://github.com/francescomalatesta/laravel-forge-mcp/commit/8dc94ce0546a93750bd6790a6fcfe9fa9c94a6ba))
- **servers:** manage Nginx templates ([a48bda3](https://github.com/francescomalatesta/laravel-forge-mcp/commit/a48bda307faf74c8a6084bc9ddadc0eb4762458e))
- **monitoring:** manage heartbeats and server monitors ([36e601a](https://github.com/francescomalatesta/laravel-forge-mcp/commit/36e601a01c537be697ef0885162f2d185817bd0b))

## [0.12.0] - 2026-10-09

### Features

- **security:** manage firewall, basic auth, redirects and SSH keys ([d5f3d78](https://github.com/francescomalatesta/laravel-forge-mcp/commit/d5f3d7844c5ca4fb254bd923da838e368d39de29))

## [0.11.0] - 2026-10-09

### Features

- **jobs:** manage scheduled jobs and background processes ([f93647a](https://github.com/francescomalatesta/laravel-forge-mcp/commit/f93647a624f0c27bb22cce47a4167e1a35f92198))

## [0.10.0] - 2026-10-09

### Features

- **commands:** run commands on sites and read their output ([2b22955](https://github.com/francescomalatesta/laravel-forge-mcp/commit/2b229558ba3c929bad3d4b486b4b6662c1f04381))
- **integrations:** enable and disable Laravel integrations and maintenance mode ([5dd5173](https://github.com/francescomalatesta/laravel-forge-mcp/commit/5dd5173d6c7f7ce0e6db32b6dd6a5f3f1a6f621f))

## [0.9.0] - 2026-10-09

### Features

- **backups:** manage database backups and storage providers ([d146539](https://github.com/francescomalatesta/laravel-forge-mcp/commit/d1465399c1f582055a85c57ecb14aaee4efc74d5))

## [0.8.0] - 2026-10-09

### Features

- **databases:** manage database schemas, users and root password ([f3ca2ba](https://github.com/francescomalatesta/laravel-forge-mcp/commit/f3ca2bab7af31b222ce81cace5268a4f187f16f4))

## [0.7.0] - 2026-10-09

### Features

- **servers:** manage PHP versions, settings and configuration ([f12c016](https://github.com/francescomalatesta/laravel-forge-mcp/commit/f12c0165b2376040ce0fec11daf8ed400f402742))

## [0.6.0] - 2026-10-09

### Features

- **servers:** restart services, reboot and manage servers ([40c4f3b](https://github.com/francescomalatesta/laravel-forge-mcp/commit/40c4f3be419c9ab028ff0b6b71b7f64cc55b8bed))

## [0.5.0] - 2026-10-09

### Features

- **sites:** manage domains and SSL certificates ([05cf271](https://github.com/francescomalatesta/laravel-forge-mcp/commit/05cf27163d5c6b41e121287f1782642fed4b0065))

## [0.4.0] - 2026-10-09

### Features

- **sites:** manage site lifecycle, configuration and logs ([90a6a52](https://github.com/francescomalatesta/laravel-forge-mcp/commit/90a6a52281650c2c5c112631b599bc992aaf2827))

## [0.3.0] - 2026-10-09

### Features

- **deployments:** follow background operations until they finish ([d8b4926](https://github.com/francescomalatesta/laravel-forge-mcp/commit/d8b4926b5c53bfe20b56353ae09f7a59bc1f8cf6))

## [0.2.0] - 2026-10-09

### Features

- **deployments:** add site, event and deployment tools ([5e22573](https://github.com/francescomalatesta/laravel-forge-mcp/commit/5e2257341aaca75e87b5931f5262e1849105a088))

## [0.1.0]

First public release.

### Added

- MCP server over stdio for the Laravel Forge API (v2, organization-scoped).
- Tools: `forge_list_organizations`, `forge_list_servers` (filters, sorting, cursor pagination, concise/detailed output).
- Configuration via environment variables: toolsets, read-only mode, secrets opt-in, default organization.
- Forge client with timeouts, retries for rate limits and transient errors, and actionable error messages.
- API coverage report based on the official Forge OpenAPI spec.
