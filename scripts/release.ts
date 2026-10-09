/**
 * Release automation used by .github/workflows/release.yml.
 *
 *   tsx scripts/release.ts plan              decide what to release (writes GitHub step outputs)
 *   tsx scripts/release.ts changelog <file>  prepend the planned notes (from <file>) to CHANGELOG.md
 *
 * `plan` modes:
 *   release  new commits warrant a release: bump to `version`
 *   publish  package.json holds a version that is not on npm yet (manual bump or failed run): publish it as is
 *   skip     nothing to release
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  changelogSection,
  determineBump,
  nextVersion,
  parseCommit,
  prependChangelog,
  renderNotes,
  type Commit,
  type ParsedCommit,
} from './release/conventional.js';

const REPOSITORY_URL = 'https://github.com/francescomalatesta/laravel-forge-mcp';

const [command, argument] = process.argv.slice(2);

switch (command) {
  case 'plan':
    await plan();
    break;
  case 'changelog':
    if (!argument) fail('Usage: release.ts changelog <notes-file>');
    writeChangelog(argument);
    break;
  default:
    fail('Usage: release.ts <plan|changelog>');
}

async function plan(): Promise<void> {
  const pkg = readPackage();
  const notesFile = join(process.env.RUNNER_TEMP ?? '.', 'release-notes.md');

  // A newer push will release everything: only the run for the current head of main may release.
  const sha = process.env.GITHUB_SHA;
  if (sha) {
    git('fetch', '--quiet', 'origin', 'main');
    const head = git('rev-parse', 'origin/main');
    if (head !== sha) return output({ mode: 'skip', reason: `main moved to ${head.slice(0, 7)}; the newer run will release` });
  }

  const published = await registryManifest(pkg.name, pkg.version);
  if (!published) {
    const notes = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), pkg.version) ?? `Release ${pkg.version}.`;
    writeFileSync(notesFile, `${notes}\n`);
    return output({ mode: 'publish', version: pkg.version, notes_file: notesFile, reason: `${pkg.version} is not on npm yet` });
  }

  const tag = `v${pkg.version}`;
  const baseline = tagExists(tag) ? tag : publishedCommit(tag, published.gitHead);

  const commits = commitsSince(baseline)
    .map(parseCommit)
    .filter((commit): commit is ParsedCommit => commit !== undefined);
  const bump = determineBump(commits);
  if (!bump) return output({ mode: 'skip', reason: `no feat/fix/perf/breaking commits since ${tag}` });

  const version = nextVersion(pkg.version, bump);
  writeFileSync(notesFile, `${renderNotes(commits, REPOSITORY_URL)}\n`);
  output({ mode: 'release', version, bump, notes_file: notesFile, reason: `${bump} bump from ${pkg.version}` });
}

function writeChangelog(notesFile: string): void {
  const { version } = readPackage();
  const date = new Date().toISOString().slice(0, 10);
  const notes = readFileSync(notesFile, 'utf8').trim();
  writeFileSync('CHANGELOG.md', prependChangelog(readFileSync('CHANGELOG.md', 'utf8'), version, date, notes));
  console.log(`CHANGELOG.md updated for ${version}`);
}

function readPackage(): { name: string; version: string } {
  return JSON.parse(readFileSync('package.json', 'utf8'));
}

/** The published manifest of `name@version`, or undefined when that version is not on npm. */
async function registryManifest(name: string, version: string): Promise<{ gitHead?: string } | undefined> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/${version}`);
  if (response.status === 404) return undefined;
  if (!response.ok) fail(`npm registry returned ${response.status} for ${name}@${version}`);
  return (await response.json()) as { gitHead?: string };
}

/**
 * Falls back to the commit npm recorded at publish time (`gitHead`) when the
 * version tag is missing, e.g. after a manual first publish without tagging.
 * The tag is not recreated: GitHub refuses GITHUB_TOKEN pushes of refs to
 * commits whose workflow files differ from the default branch.
 */
function publishedCommit(tag: string, gitHead: string | undefined): string {
  const isAncestor = (commit: string) => {
    try {
      git('merge-base', '--is-ancestor', commit, 'HEAD');
      return true;
    } catch {
      return false;
    }
  };
  if (!gitHead || !isAncestor(gitHead)) {
    fail(`Tag ${tag} is missing and npm has no usable gitHead for it: create the tag on the released commit and push it.`);
  }
  console.log(`Tag ${tag} not found: using the published commit ${gitHead.slice(0, 7)} (npm gitHead) as the baseline.`);
  return gitHead;
}

function commitsSince(ref: string): Commit[] {
  const log = git('log', `${ref}..HEAD`, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e');
  return log
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', subject = '', body = ''] = entry.split('\x1f');
      return { hash, subject, body };
    });
}

function tagExists(tag: string): boolean {
  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function output(values: Record<string, string>): void {
  console.log(Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
