# Releasing

Releases are fully automated by the [Release workflow](.github/workflows/release.yml). On every push to `main` it:

1. runs the full CI (typecheck, tests, API coverage, build, package check);
2. reads the commits since the last version tag and decides the bump from their [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) type;
3. if a release is due: bumps `package.json`, `package-lock.json` and `server.json`, updates `CHANGELOG.md`, pushes a `chore(release): vX.Y.Z` commit and the `vX.Y.Z` tag;
4. publishes to npm with Trusted Publishing (OIDC, no token stored in GitHub, provenance attached);
5. creates a GitHub release with the same notes;
6. optionally publishes `server.json` to the MCP Registry.

## Commit messages decide the version

| Commit | Example | Release |
|---|---|---|
| `fix:` / `perf:` | `fix(client): retry on 502` | patch (`0.1.0` → `0.1.1`) |
| `feat:` | `feat(sites): add forge_list_sites` | minor (`0.1.0` → `0.2.0`) |
| `!` after the type, or a `BREAKING CHANGE:` footer | `feat!: rename FORGE_TOOLSETS values` | major (minor while the version is `0.x`) |
| `docs:`, `chore:`, `test:`, `ci:`, `refactor:`, `build:`, `style:` | `docs: improve README` | no release |

Commits that don't follow the format are ignored. When several commits land together, the highest bump wins. Merge commits are ignored: with pull requests, prefer squash merges with a conventional PR title.

### Releasing a specific version (e.g. 1.0.0)

Bump manually and push; the workflow publishes any version in `package.json` that is not on npm yet:

```bash
npm version 1.0.0      # syncs server.json, commits and tags
git push --follow-tags
```

The same mechanism recovers from a run that pushed the release commit but failed to publish: re-run the workflow (Actions → Release → Run workflow).

## One-time setup

1. **Trusted publisher on npm.** On npmjs.com open the package → **Settings** → **Trusted publishing** → **GitHub Actions**:

   | Field | Value |
   |---|---|
   | Organization or user | `francescomalatesta` |
   | Repository | `laravel-forge-mcp` |
   | Workflow filename | `release.yml` |
   | Environment | *(leave empty)* |

   Allow **`npm publish`** (recent configurations may default to staged publishing only). According to npm's docs a new trusted publisher must be used by a successful publish within 2 days, so set it up when you are about to push a `feat:` or `fix:` commit.

2. **Branch protection.** The workflow pushes the release commit to `main` with the built-in `GITHUB_TOKEN`. If `main` requires pull requests or status checks, allow GitHub Actions to bypass those rules, otherwise the push is rejected.

3. **Version tags.** Each release is computed from the tag of the current version (`v0.1.0`, `v0.2.0`, ...). If the tag of the published version is missing (e.g. after a manual publish), the workflow uses the commit npm recorded at publish time (`gitHead`) instead. The tag itself is not recreated, because GitHub does not let the Actions token push tags to older commits whose workflow files differ.

Once a CI release has succeeded you can set the package's **Publishing access** to *require two-factor authentication and disallow tokens*.

## MCP Registry (optional)

`server.json` and the `mcpName` field in `package.json` describe the server for the official [MCP Registry](https://registry.modelcontextprotocol.io) under the `io.github.francescomalatesta` namespace. Publishing there is disabled by default. To enable it, set these repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `MCP_REGISTRY_PUBLISH` | `true` |
| `MCP_PUBLISHER_VERSION` | a release tag from [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry/releases) (recommended; defaults to `latest`) |

The job runs after the release job, skips versions already in the registry and authenticates with GitHub OIDC. Registry versions cannot be overwritten.
