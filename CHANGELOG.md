# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
