import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_BASE_URL, loadConfig, parseToolsets } from '../src/config.js';
import { DEFAULT_TOOLSETS, TOOLSET_NAMES } from '../src/tools/toolsets.js';

describe('loadConfig', () => {
  it('requires FORGE_API_TOKEN', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ FORGE_API_TOKEN: '   ' })).toThrow(/FORGE_API_TOKEN/);
  });

  it('applies defaults', () => {
    const config = loadConfig({ FORGE_API_TOKEN: 'token' });
    expect(config).toMatchObject({
      apiToken: 'token',
      baseUrl: DEFAULT_BASE_URL,
      organization: undefined,
      readOnly: false,
      allowSecrets: false,
      timeoutMs: 30_000,
      maxRetries: 2,
    });
    expect([...config.toolsets]).toEqual([...DEFAULT_TOOLSETS]);
  });

  it('reads every option', () => {
    const config = loadConfig({
      FORGE_API_TOKEN: 'token',
      FORGE_API_URL: 'https://forge.example.com/api/',
      FORGE_ORGANIZATION: ' acme ',
      FORGE_TOOLSETS: 'core,databases',
      FORGE_READ_ONLY: 'true',
      FORGE_ALLOW_SECRETS: '1',
      FORGE_TIMEOUT_MS: '5000',
      FORGE_MAX_RETRIES: '0',
    });
    expect(config).toMatchObject({
      baseUrl: 'https://forge.example.com/api',
      organization: 'acme',
      readOnly: true,
      allowSecrets: true,
      timeoutMs: 5000,
      maxRetries: 0,
    });
    expect([...config.toolsets]).toEqual(['core', 'databases']);
  });

  it.each([
    ['FORGE_READ_ONLY', 'maybe'],
    ['FORGE_TIMEOUT_MS', '10'],
    ['FORGE_MAX_RETRIES', '-1'],
    ['FORGE_API_URL', 'not a url'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => loadConfig({ FORGE_API_TOKEN: 'token', [name]: value })).toThrow(ConfigError);
  });
});

describe('parseToolsets', () => {
  it('supports "all" and "default" keywords', () => {
    expect([...parseToolsets('all')]).toEqual(TOOLSET_NAMES);
    expect([...parseToolsets('default, databases')]).toEqual([...DEFAULT_TOOLSETS, 'databases']);
  });

  it('rejects unknown toolsets with the list of valid ones', () => {
    expect(() => parseToolsets('core,nope')).toThrow(/Unknown toolset "nope".*Valid values/);
  });
});
