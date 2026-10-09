import { afterEach, describe, expect, it } from 'vitest';
import { PHP_VERSIONS } from '../../src/tools/sites/shared.js';
import { versionNumber } from '../../src/tools/php/shared.js';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const PHP = `${SERVER}/php`;
const VERSIONS = `${PHP}/versions`;
const env = { FORGE_TOOLSETS: 'core,servers' };

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const version = (id: string, number: string, status = 'installed') =>
  specSchema('PhpVersionResource', { id, attributes: { version: number, binary_name: `php${number}`, status } });
const versionList = (...items: ReturnType<typeof version>[]) => ({
  body: specResponse('organizations.servers.php.versions.index', 200, { data: items }),
});
const setting = (operationId: string, attributes: Record<string, unknown>) => ({
  body: specResponse(operationId, 200, { data: { attributes } }),
});

describe('versionNumber', () => {
  it.each([
    ['php83', '8.3'],
    ['8.3', '8.3'],
    ['PHP 8.4', '8.4'],
    ['php56', '5.6'],
    ['9.9', undefined],
  ])('%s → %s', (input, expected) => {
    expect(versionNumber(input)).toBe(expected);
  });

  it('maps every installable identifier except legacy PHP 5 builds', () => {
    const unmapped = PHP_VERSIONS.filter((v) => !versionNumber(v));
    expect(unmapped).toEqual(['php5', 'php56-old']);
  });
});

describe('PHP versions', () => {
  it('forge_list_php_versions lists installed versions with filters', async () => {
    harness = await createHarness({ env, responses: [versionList(version('21', '8.3'), version('22', '8.4'))] });
    const result = await harness.call('forge_list_php_versions', { server: 3, status: 'installed' });
    expect(harness.requests[0]?.url.searchParams.get('filter[status]')).toBe('installed');
    expect(result.structuredContent).toMatchObject({ php_versions: [{ id: '21', version: '8.3' }, { id: '22', version: '8.4' }] });
    expect(textOf(result)).toContain('8.3 (installed, ID 21)');
  });

  it('forge_install_php_version waits until the version shows as installed', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 202 }, versionList(), versionList(version('23', '8.4', 'installing')), versionList(version('23', '8.4'))],
    });
    const result = await harness.call('forge_install_php_version', { server: 3, version: 'php84', cli_default: true });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { version: 'php84', cli_default: true } });
    expect(harness.requests[1]?.url.searchParams.get('filter[version]')).toBe('8.4');
    expect(result.structuredContent).toMatchObject({ status: 'completed', php_version: { id: '23', status: 'installed' } });
  });

  it('forge_upgrade_php_version resolves the version to its ID', async () => {
    harness = await createHarness({ env, responses: [versionList(version('21', '8.3')), { status: 202 }] });
    const result = await harness.call('forge_upgrade_php_version', { server: 3, php_version: 'php83' });
    expect(paths()).toEqual([`GET ${VERSIONS}`, `PUT ${VERSIONS}/21`]);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_server_events' });
  });

  it('forge_uninstall_php_version accepts an ID and waits until it is gone', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202 },
        { body: specResponse('organizations.servers.php.versions.show', 200, { data: version('21', '8.3', 'removing') }) },
        { status: 404, body: { message: 'Not found.' } },
      ],
    });
    const result = await harness.call('forge_uninstall_php_version', { server: 3, php_version: 21 });
    expect(paths()).toEqual([`DELETE ${VERSIONS}/21`, `GET ${VERSIONS}/21`, `GET ${VERSIONS}/21`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_php_versions' });
  });

  it('explains when a version is not installed', async () => {
    harness = await createHarness({ env, responses: [versionList(version('21', '8.3'))] });
    const result = await harness.call('forge_uninstall_php_version', { server: 3, php_version: '8.1' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('PHP 8.1 is not installed on server 3');
  });
});

describe('PHP settings', () => {
  it('forge_get_php_settings combines the five settings endpoints', async () => {
    harness = await createHarness({
      env,
      responses: [
        setting('organizations.servers.php.cli-version.show', { version: '8.3' }),
        setting('organizations.servers.php.site-version.show', { version: '8.4' }),
        setting('organizations.servers.php.max-upload-size.show', { max_upload_size: 128 }),
        setting('organizations.servers.php.max-execution-time.show', { max_execution_time: 60 }),
        setting('organizations.servers.php.opcache.show', { opcache_enabled: true }),
      ],
    });
    const result = await harness.call('forge_get_php_settings', { server: 3 });
    expect(result.structuredContent).toEqual({
      cli_version: '8.3',
      site_version: '8.4',
      max_upload_size: 128,
      max_execution_time: 60,
      opcache_enabled: true,
    });
  });

  it('forge_set_default_php_version sets the CLI version and waits', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 204 }, setting('organizations.servers.php.cli-version.show', { version: '8.4' })],
    });
    const result = await harness.call('forge_set_default_php_version', { server: 3, target: 'cli', php_version: 'php84' });
    expect(paths()).toEqual([`PUT ${PHP}/cli-version`, `GET ${PHP}/cli-version`]);
    expect(harness.requests[0]?.body).toEqual({ php_version: '8.4' });
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_php_settings' });
  });

  it('forge_update_php_limits updates and verifies each requested limit', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202 },
        { status: 202 },
        setting('organizations.servers.php.max-upload-size.show', { max_upload_size: 256 }),
        setting('organizations.servers.php.max-execution-time.show', { max_execution_time: 120 }),
      ],
    });
    const result = await harness.call('forge_update_php_limits', { server: 3, max_upload_size: 256, max_execution_time: 120 });
    expect(paths()).toEqual([`PUT ${PHP}/max-upload-size`, `PUT ${PHP}/max-execution-time`, `GET ${PHP}/max-upload-size`, `GET ${PHP}/max-execution-time`]);
    expect(harness.requests[0]?.body).toEqual({ max_upload_size: 256 });
    expect(harness.requests[1]?.body).toEqual({ max_execution_time: 120 });
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_php_settings' });
  });

  it('forge_set_php_opcache disables OPcache', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 202 }, setting('organizations.servers.php.opcache.show', { opcache_enabled: false })],
    });
    const result = await harness.call('forge_set_php_opcache', { server: 3, enabled: false });
    expect(paths()).toEqual([`DELETE ${PHP}/opcache`, `GET ${PHP}/opcache`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_php_settings' });
  });
});

describe('PHP configuration files', () => {
  const config = (operationId: string, configuration: string) => ({ body: specResponse(operationId, 200, { data: { attributes: { configuration } } }) });

  it('reads and replaces the pool configuration of an isolated user', async () => {
    harness = await createHarness({
      env,
      responses: [
        versionList(version('21', '8.3')),
        config('organizations.servers.php.versions.configs.pool.show', '[www]\npm = dynamic'),
        versionList(version('21', '8.3')),
        { status: 202 },
        config('organizations.servers.php.versions.configs.pool.show', '[www]\npm = ondemand\n'),
      ],
    });
    const current = await harness.call('forge_get_php_config', { server: 3, php_version: '8.3', config: 'pool', user: 'acme' });
    expect(current.structuredContent).toEqual({ content: '[www]\npm = dynamic' });
    expect(harness.requests[1]?.url.searchParams.get('user')).toBe('acme');

    const result = await harness.call('forge_update_php_config', {
      server: 3,
      php_version: '8.3',
      config: 'pool',
      user: 'acme',
      content: '[www]\npm = ondemand',
    });
    expect(harness.requests[3]).toMatchObject({ method: 'PUT', body: { config: '[www]\npm = ondemand', user: 'acme' } });
    expect(harness.requests[3]?.url.pathname).toBe(`${VERSIONS}/21/configs/pool`);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_php_config' });
  });

  it('ignores `user` for files other than the pool', async () => {
    harness = await createHarness({ env, responses: [config('organizations.servers.php.versions.configs.fpm.show', 'memory_limit = 512M')] });
    await harness.call('forge_get_php_config', { server: 3, php_version: 21, config: 'fpm', user: 'acme' });
    expect(paths()).toEqual([`GET ${VERSIONS}/21/configs/fpm`]);
    expect(harness.requests[0]?.url.searchParams.has('user')).toBe(false);
  });
});
