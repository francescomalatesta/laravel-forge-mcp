# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0]

First public release.

### Added

- MCP server over stdio for the Laravel Forge API (v2, organization-scoped).
- Tools: `forge_list_organizations`, `forge_list_servers` (filters, sorting, cursor pagination, concise/detailed output).
- Configuration via environment variables: toolsets, read-only mode, secrets opt-in, default organization.
- Forge client with timeouts, retries for rate limits and transient errors, and actionable error messages.
- API coverage report based on the official Forge OpenAPI spec.
