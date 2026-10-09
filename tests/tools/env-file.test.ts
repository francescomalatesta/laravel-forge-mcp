import { describe, expect, it } from 'vitest';
import { formatEnvValue, patchEnv, sameEnv } from '../../src/tools/sites/env-file.js';

const ENV = ['# App', 'APP_NAME=Forge', 'APP_DEBUG=true', '', 'export DB_HOST=127.0.0.1', 'DB_PASSWORD="s3cret"', 'APP_DEBUG=duplicate'].join('\n') + '\n';

describe('patchEnv', () => {
  it('updates keys in place, appends new ones and keeps every other line', () => {
    const patch = patchEnv(ENV, { set: { APP_DEBUG: 'false', DB_HOST: 'db.internal', MAIL_FROM: 'Forge <hi@example.com>' } });

    expect(patch.content).toBe(
      [
        '# App',
        'APP_NAME=Forge',
        'APP_DEBUG=false',
        '',
        'export DB_HOST=db.internal',
        'DB_PASSWORD="s3cret"',
        "MAIL_FROM='Forge <hi@example.com>'",
      ].join('\n') + '\n',
    );
    expect(patch.updated).toEqual(['APP_DEBUG', 'DB_HOST']);
    expect(patch.added).toEqual(['MAIL_FROM']);
    expect(patch.removed).toEqual([]);
  });

  it('removes every occurrence of unset keys', () => {
    const patch = patchEnv(ENV, { unset: ['APP_DEBUG', 'MISSING'] });
    expect(patch.content).not.toContain('APP_DEBUG');
    expect(patch.removed).toEqual(['APP_DEBUG']);
    expect(patch.content).toContain('DB_PASSWORD="s3cret"');
  });

  it('works on an empty file', () => {
    expect(patchEnv('', { set: { A: '1' } })).toMatchObject({ content: 'A=1\n', added: ['A'] });
  });
});

describe('formatEnvValue', () => {
  it.each([
    ['plain', 'plain'],
    ['https://example.com/path?x=1', "'https://example.com/path?x=1'"],
    ['', ''],
    ['with space', "'with space'"],
    ['${NOT_INTERPOLATED}', "'${NOT_INTERPOLATED}'"],
    ["it's", '"it\'s"'],
    ['say "hi" \\o/', "'say \"hi\" \\o/'"],
    ["a'b\"c", '"a\'b\\"c"'],
    ['line1\nline2', '"line1\\nline2"'],
  ])('%j → %s', (value, expected) => {
    expect(formatEnvValue(value)).toBe(expected);
  });
});

describe('sameEnv', () => {
  it('ignores trailing whitespace', () => {
    expect(sameEnv('A=1\n\n', 'A=1')).toBe(true);
    expect(sameEnv('A=1', 'A=2')).toBe(false);
    expect(sameEnv(null, '')).toBe(true);
  });
});
