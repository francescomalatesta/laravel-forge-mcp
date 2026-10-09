# Releasing

Releases are published to npm by the [Release workflow](.github/workflows/release.yml) when a `v*.*.*` tag is pushed. It authenticates with npm **Trusted Publishing** (OIDC): no npm token is stored in GitHub, and published versions carry provenance attestations.

## One-time setup

### 1. First publish (manual)

npm can only attach a trusted publisher to a package that already exists, so the first version is published from your machine.

```bash
git clone https://github.com/francescomalatesta/laravel-forge-mcp.git
cd laravel-forge-mcp
npm ci
npm login                # an npm account with 2FA enabled
npm publish              # prepublishOnly runs typecheck, tests, API coverage and the build
```

The package is scoped (`@francescomalatesta/...`): the npm user or organization must be `francescomalatesta`. `publishConfig.access` is already `public`.

Check it works:

```bash
FORGE_API_TOKEN=your-token npx -y @francescomalatesta/laravel-forge-mcp
```

### 2. Configure the trusted publisher

On npmjs.com open the package → **Settings** → **Trusted publishing** → **GitHub Actions** and enter:

| Field | Value |
|---|---|
| Organization or user | `francescomalatesta` |
| Repository | `laravel-forge-mcp` |
| Workflow filename | `release.yml` |
| Environment | *(leave empty)* |

Make sure **`npm publish`** is allowed (recent configurations may default to staged publishing only).

npm expects a new trusted publisher to be used by a successful publish soon after it is created (the docs mention 2 days), so do the next release shortly after configuring it.

Optionally, once a CI release has succeeded, set **Publishing access** to *require two-factor authentication and disallow tokens*.

## Every release

1. Update `CHANGELOG.md` and commit it.
2. Bump the version. This also syncs `server.json`, commits and creates the tag:
   ```bash
   npm version patch   # or minor / major
   ```
3. Push the commit and the tag:
   ```bash
   git push --follow-tags
   ```

The workflow verifies that the tag matches `package.json` and `server.json`, runs all checks, publishes to npm and creates a GitHub release with generated notes.

## MCP Registry (optional)

`server.json` and the `mcpName` field in `package.json` describe the server for the official [MCP Registry](https://registry.modelcontextprotocol.io) under the `io.github.francescomalatesta` namespace. Publishing there is disabled by default. To enable it, set these repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `MCP_REGISTRY_PUBLISH` | `true` |
| `MCP_PUBLISHER_VERSION` | a release tag from [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry/releases) (recommended; defaults to `latest`) |

The `mcp-registry` job then runs after a successful npm publish and authenticates with GitHub OIDC. A published registry version cannot be overwritten, so publish only versions you are happy with.
