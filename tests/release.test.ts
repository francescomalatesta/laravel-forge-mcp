import { describe, expect, it } from 'vitest';
import {
  changelogSection,
  determineBump,
  nextVersion,
  parseCommit,
  prependChangelog,
  renderNotes,
  type ParsedCommit,
} from '../scripts/release/conventional.js';

const commit = (subject: string, body = '', hash = 'a'.repeat(40)) => parseCommit({ hash, subject, body });
const parsed = (...subjects: string[]) => subjects.map((subject) => commit(subject)).filter((c): c is ParsedCommit => c !== undefined);

describe('parseCommit', () => {
  it('parses type, scope, description and breaking markers', () => {
    expect(commit('feat(servers): add forge_get_server')).toMatchObject({
      type: 'feat',
      scope: 'servers',
      description: 'add forge_get_server',
      breaking: false,
    });
    expect(commit('fix!: rename argument')?.breaking).toBe(true);
    expect(commit('refactor: drop option', 'BREAKING CHANGE: FORGE_X was removed')?.breaking).toBe(true);
  });

  it('ignores commits that are not conventional', () => {
    expect(commit('Phase 0: project foundations')).toBeUndefined();
    expect(commit('Merge branch main')).toBeUndefined();
  });
});

describe('determineBump', () => {
  it('picks the highest bump', () => {
    expect(determineBump(parsed('fix: a', 'docs: b'))).toBe('patch');
    expect(determineBump(parsed('perf: a'))).toBe('patch');
    expect(determineBump(parsed('fix: a', 'feat: b'))).toBe('minor');
    expect(determineBump(parsed('feat: a', 'chore!: b'))).toBe('major');
  });

  it('does not release for docs, chore, test, ci or refactor commits', () => {
    expect(determineBump(parsed('docs: a', 'chore: b', 'test: c', 'ci: d', 'refactor: e'))).toBeUndefined();
    expect(determineBump([])).toBeUndefined();
  });
});

describe('nextVersion', () => {
  it('applies semver bumps', () => {
    expect(nextVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('treats breaking changes as minor before 1.0.0', () => {
    expect(nextVersion('0.1.0', 'major')).toBe('0.2.0');
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
  });

  it('rejects unsupported versions', () => {
    expect(() => nextVersion('1.0.0-beta.1', 'patch')).toThrow(/Unsupported version/);
  });
});

describe('release notes and changelog', () => {
  const commits = [
    commit('feat(sites): add forge_list_sites', '', '1111111aaaa'),
    commit('fix: handle empty pages', '', '2222222bbbb'),
    commit('feat!: rename FORGE_TOOLSETS values', '', '3333333cccc'),
    commit('docs: typo', '', '4444444dddd'),
  ].filter((c): c is ParsedCommit => c !== undefined);

  it('groups changes by type and links commits', () => {
    expect(renderNotes(commits, 'https://github.com/o/r')).toBe(
      [
        '### Breaking changes',
        '',
        '- rename FORGE_TOOLSETS values ([3333333](https://github.com/o/r/commit/3333333cccc))',
        '',
        '### Features',
        '',
        '- **sites:** add forge_list_sites ([1111111](https://github.com/o/r/commit/1111111aaaa))',
        '',
        '### Bug fixes',
        '',
        '- handle empty pages ([2222222](https://github.com/o/r/commit/2222222bbbb))',
      ].join('\n'),
    );
  });

  it('inserts the new section above previous releases and can read it back', () => {
    const before = '# Changelog\n\nIntro.\n\n## [0.1.0]\n\nFirst release.\n';
    const after = prependChangelog(before, '0.2.0', '2026-10-09', '### Features\n\n- x');
    expect(after).toBe('# Changelog\n\nIntro.\n\n## [0.2.0] - 2026-10-09\n\n### Features\n\n- x\n\n## [0.1.0]\n\nFirst release.\n');
    expect(changelogSection(after, '0.2.0')).toBe('### Features\n\n- x');
    expect(changelogSection(after, '0.1.0')).toBe('First release.');
    expect(changelogSection(after, '9.9.9')).toBeUndefined();
  });
});
