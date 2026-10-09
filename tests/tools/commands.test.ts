import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const COMMANDS = '/api/orgs/acme/servers/3/sites/7/commands';
const env = { FORGE_TOOLSETS: 'core,commands' };
const CMD = 'php artisan migrate --force';
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const run = (id: string, status: string, exit_code: number | null = null) =>
  specSchema('CommandResource', { id, attributes: { command: CMD, status, exit_code, error_output: null } });
const runList = (...items: ReturnType<typeof run>[]) => ({
  body: specResponse('organizations.servers.sites.commands.index', 200, { data: items }),
});
const output = (text: string) => ({
  body: specResponse('organizations.servers.sites.commands.output.show', 200, { data: { attributes: { output: text } } }),
});

describe('site commands', () => {
  it('are not enabled by default', async () => {
    harness = await createHarness({ env: { FORGE_TOOLSETS: 'all' } });
    const all = (await harness.client.listTools()).tools.map((tool) => tool.name);
    expect(all).toContain('forge_run_site_command');
    await harness.close();
    harness = await createHarness();
    expect((await harness.client.listTools()).tools.map((tool) => tool.name)).not.toContain('forge_run_site_command');
  });

  it('forge_run_site_command runs a command and returns the end of its output', async () => {
    harness = await createHarness({
      env,
      responses: [
        runList(run('40', 'finished', 0)),
        { status: 202 },
        runList(run('41', 'running'), run('40', 'finished', 0)),
        runList(run('41', 'finished', 0), run('40', 'finished', 0)),
        output('line 1\nline 2\nMigrated: 2025_01_01_create_orders'),
      ],
    });
    const result = await harness.call('forge_run_site_command', { server: 3, site: 7, command: CMD, output_lines: 2 });
    expect(harness.requests[0]?.url.searchParams.get('filter[command]')).toBe(CMD);
    expect(harness.requests[1]).toMatchObject({ method: 'POST', body: { command: CMD } });
    expect(paths().at(-1)).toBe(`GET ${COMMANDS}/41/output`);
    expect(result.structuredContent).toMatchObject({
      status: 'completed',
      command: { id: '41', exit_code: 0 },
      output: 'line 2\nMigrated: 2025_01_01_create_orders',
      output_truncated: true,
      output_total_lines: 3,
    });
  });

  it('forge_run_site_command reports a non-zero exit code as failed', async () => {
    harness = await createHarness({
      env,
      responses: [runList(), { status: 202 }, runList(run('41', 'finished', 1)), output('SQLSTATE[HY000]')],
    });
    const result = await harness.call('forge_run_site_command', { server: 3, site: 7, command: CMD });
    expect(result.structuredContent).toMatchObject({ status: 'failed', command: { exit_code: 1 }, output: 'SQLSTATE[HY000]' });
  });

  it('forge_run_site_command returns right away with wait false', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_run_site_command', { server: 3, site: 7, command: CMD, wait: false });
    expect(paths()).toEqual([`POST ${COMMANDS}`]);
    expect(result.structuredContent).toMatchObject({ status: 'queued', command: null, output: null });
  });

  it('forge_list_site_commands lists newest first with filters', async () => {
    harness = await createHarness({ env, responses: [runList(run('41', 'failed'))] });
    const result = await harness.call('forge_list_site_commands', { server: 3, site: 7, status: 'failed' });
    expect(harness.requests[0]?.url.searchParams.get('sort')).toBe('-created_at');
    expect(harness.requests[0]?.url.searchParams.get('filter[status]')).toBe('failed');
    expect(result.structuredContent).toMatchObject({ commands: [{ id: '41', status: 'failed' }] });
  });

  it('forge_get_site_command returns the command with its output', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.sites.commands.show', 200, { data: run('41', 'finished', 0) }) },
        output('done'),
      ],
    });
    const result = await harness.call('forge_get_site_command', { server: 3, site: 7, command: 41 });
    expect(new Set(paths())).toEqual(new Set([`GET ${COMMANDS}/41`, `GET ${COMMANDS}/41/output`]));
    expect(result.structuredContent).toMatchObject({ command: { id: '41', status: 'finished' }, output: 'done' });
  });

  it('forge_delete_site_command deletes a run from the history', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_delete_site_command', { server: 3, site: 7, command: 41 });
    expect(paths()).toEqual([`DELETE ${COMMANDS}/41`]);
    expect(result.structuredContent).toEqual({ deleted: true });
  });
});
