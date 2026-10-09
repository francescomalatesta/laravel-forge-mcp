/**
 * Conventional Commits → semantic version bump and release notes.
 * https://www.conventionalcommits.org/en/v1.0.0/
 */

export type Bump = 'major' | 'minor' | 'patch';

export interface Commit {
  hash: string;
  subject: string;
  body: string;
}

export interface ParsedCommit {
  hash: string;
  type: string;
  scope: string | undefined;
  description: string;
  breaking: boolean;
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<description>.+)$/i;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;

/** Types that produce a release; everything else (docs, chore, test, ci, ...) does not. */
const RELEASE_TYPES: Record<string, Bump> = { feat: 'minor', fix: 'patch', perf: 'patch' };

const SECTIONS: { title: string; matches: (commit: ParsedCommit) => boolean }[] = [
  { title: 'Breaking changes', matches: (c) => c.breaking },
  { title: 'Features', matches: (c) => !c.breaking && c.type === 'feat' },
  { title: 'Bug fixes', matches: (c) => !c.breaking && c.type === 'fix' },
  { title: 'Performance', matches: (c) => !c.breaking && c.type === 'perf' },
];

/** Returns undefined for commits that do not follow the Conventional Commits format. */
export function parseCommit(commit: Commit): ParsedCommit | undefined {
  const match = HEADER.exec(commit.subject.trim());
  if (!match?.groups) return undefined;
  return {
    hash: commit.hash,
    type: match.groups.type!.toLowerCase(),
    scope: match.groups.scope,
    description: match.groups.description!.trim(),
    breaking: match.groups.bang === '!' || BREAKING_FOOTER.test(commit.body),
  };
}

/** The highest bump required by the commits, or undefined when nothing should be released. */
export function determineBump(commits: readonly ParsedCommit[]): Bump | undefined {
  if (commits.some((commit) => commit.breaking)) return 'major';
  const bumps = commits.map((commit) => RELEASE_TYPES[commit.type]).filter((bump): bump is Bump => bump !== undefined);
  if (bumps.includes('minor')) return 'minor';
  if (bumps.includes('patch')) return 'patch';
  return undefined;
}

/**
 * Applies a bump to a version. Before 1.0.0 breaking changes bump the minor
 * version (0.x semantics): going to 1.0.0 is a deliberate, manual decision.
 */
export function nextVersion(current: string, bump: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Unsupported version "${current}": expected MAJOR.MINOR.PATCH.`);
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];

  const effective = major === 0 && bump === 'major' ? 'minor' : bump;
  switch (effective) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

/** Markdown release notes grouped by change type (without the version heading). */
export function renderNotes(commits: readonly ParsedCommit[], repositoryUrl?: string): string {
  const blocks: string[] = [];
  for (const section of SECTIONS) {
    const items = commits.filter(section.matches);
    if (items.length === 0) continue;
    const lines = items.map((commit) => {
      const scope = commit.scope ? `**${commit.scope}:** ` : '';
      const short = commit.hash.slice(0, 7);
      const ref = repositoryUrl ? `[${short}](${repositoryUrl}/commit/${commit.hash})` : short;
      return `- ${scope}${commit.description} (${ref})`;
    });
    blocks.push(`### ${section.title}\n\n${lines.join('\n')}`);
  }
  return blocks.join('\n\n');
}

/** Inserts a release section above the most recent one in CHANGELOG.md. */
export function prependChangelog(changelog: string, version: string, date: string, notes: string): string {
  const section = `## [${version}] - ${date}\n\n${notes}\n\n`;
  const firstRelease = changelog.search(/^## \[/m);
  if (firstRelease === -1) return `${changelog.trimEnd()}\n\n${section}`;
  return changelog.slice(0, firstRelease) + section + changelog.slice(firstRelease);
}

/** Extracts the notes of one version from CHANGELOG.md (used when re-publishing). */
export function changelogSection(changelog: string, version: string): string | undefined {
  const start = changelog.search(new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm'));
  if (start === -1) return undefined;
  const rest = changelog.slice(start);
  const bodyStart = rest.indexOf('\n') + 1;
  const next = rest.slice(bodyStart).search(/^## \[/m);
  return (next === -1 ? rest.slice(bodyStart) : rest.slice(bodyStart, bodyStart + next)).trim();
}
