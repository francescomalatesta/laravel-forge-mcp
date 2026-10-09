import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const SERVER_JOBS = `${SERVER}/scheduled-jobs`;
const SITE_JOBS = `${SERVER}/sites/7/scheduled-jobs`;
const PROCESSES = `${SERVER}/background-processes`;
const env = { FORGE_TOOLSETS: 'core,jobs' };
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const job = (id: string, status = 'installed') =>
  specSchema('JobResource', { id, attributes: { command: 'php artisan reports:send', status, user: 'forge', frequency: 'nightly', cron: '0 0 * * *' } });
const processResource = (id: string, status: string) =>
  specSchema('BackgroundProcessResource', { id, attributes: { command: 'php artisan queue:work', status, processes: 1 } });
const showProcess = (id: string, status: string) => ({
  body: specResponse('organizations.servers.background-processes.show', 200, { data: processResource(id, status) }),
});

describe('scheduled jobs', () => {
  it('forge_list_scheduled_jobs lists server or site jobs', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.scheduled-jobs.index', 200, { data: [job('5')] }) },
        { body: specResponse('organizations.servers.sites.scheduled-jobs.index', 200, { data: [job('6')] }) },
      ],
    });
    const result = await harness.call('forge_list_scheduled_jobs', { server: 3, user: 'forge' });
    expect(harness.requests[0]?.url.searchParams.get('filter[user]')).toBe('forge');
    expect(result.structuredContent).toMatchObject({ jobs: [{ id: '5', frequency: 'nightly' }] });
    await harness.call('forge_list_scheduled_jobs', { server: 3, site: 7 });
    expect(paths()).toEqual([`GET ${SERVER_JOBS}`, `GET ${SITE_JOBS}`]);
  });

  it('forge_get_scheduled_job returns the job and the output of its last run', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.sites.scheduled-jobs.show', 200, { data: job('6') }) },
        { body: specResponse('organizations.servers.sites.scheduled-jobs.outputs.show', 200, { data: { attributes: { output: 'Sent 12 reports' } } }) },
      ],
    });
    const result = await harness.call('forge_get_scheduled_job', { server: 3, site: 7, job: 6 });
    expect(new Set(paths())).toEqual(new Set([`GET ${SITE_JOBS}/6`, `GET ${SITE_JOBS}/6/output`]));
    expect(result.structuredContent).toMatchObject({ job: { id: '6' }, output: 'Sent 12 reports' });
  });

  it('forge_create_scheduled_job creates a job and waits until installed', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202, body: specResponse('organizations.servers.scheduled-jobs.store', 202, { data: job('5', 'installing') }) },
        { body: specResponse('organizations.servers.scheduled-jobs.show', 200, { data: job('5') }) },
      ],
    });
    const result = await harness.call('forge_create_scheduled_job', {
      server: 3,
      command: 'php artisan reports:send',
      frequency: 'custom',
      cron: '*/15 * * * *',
      heartbeat: true,
      grace_period: 5,
    });
    expect(harness.requests[0]).toMatchObject({
      method: 'POST',
      body: { command: 'php artisan reports:send', user: 'forge', frequency: 'custom', cron: '*/15 * * * *', heartbeat: true, grace_period: 5 },
    });
    expect(paths()).toEqual([`POST ${SERVER_JOBS}`, `GET ${SERVER_JOBS}/5`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', job: { id: '5', status: 'installed' } });
  });

  it.each([
    [{ frequency: 'custom' }, 'needs a `cron`'],
    [{ frequency: 'hourly', cron: '* * * * *' }, '`cron` is only used'],
    [{ frequency: 'hourly', grace_period: 5 }, '`grace_period` is only used'],
  ])('forge_create_scheduled_job validates %o', async (input, message) => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_scheduled_job', { server: 3, command: 'x', ...input });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('forge_delete_scheduled_job waits until the site job is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_scheduled_job', { server: 3, site: 7, job: 6 });
    expect(paths()).toEqual([`DELETE ${SITE_JOBS}/6`, `GET ${SITE_JOBS}/6`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_scheduled_jobs' });
  });
});

describe('background processes', () => {
  it('forge_list_background_processes filters by site and flags processes that are not running', async () => {
    harness = await createHarness({
      env,
      responses: [
        {
          body: specResponse('organizations.servers.background-processes.index', 200, {
            data: [processResource('8', 'running'), processResource('9', 'fatal')],
          }),
        },
      ],
    });
    const result = await harness.call('forge_list_background_processes', { server: 3, site: 7 });
    expect(harness.requests[0]?.url.searchParams.get('filter[site_id]')).toBe('7');
    expect(textOf(result)).toMatch(/^Found 2 background process\(es\); not running: 9 \(fatal\)\./);
  });

  it('forge_get_background_process_log returns the end of the log', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.background-processes.log.show', 200, { data: { attributes: { content: 'a\nb\nc' } } }) },
      ],
    });
    const result = await harness.call('forge_get_background_process_log', { server: 3, background_process: 8, lines: 2 });
    expect(paths()).toEqual([`GET ${PROCESSES}/8/log`]);
    expect(result.structuredContent).toEqual({ log: 'b\nc', truncated: true, total_lines: 3 });
  });

  it('forge_create_background_process waits until it is running', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202, body: specResponse('organizations.servers.background-processes.store', 202, { data: processResource('8', 'installing') }) },
        showProcess('8', 'starting'),
        showProcess('8', 'running'),
      ],
    });
    const result = await harness.call('forge_create_background_process', {
      server: 3,
      name: 'Queue worker',
      command: 'php artisan queue:work',
      site: 7,
      processes: 2,
    });
    expect(harness.requests[0]?.body).toEqual({ name: 'Queue worker', site_id: 7, command: 'php artisan queue:work', user: 'forge', processes: 2 });
    expect(result.structuredContent).toMatchObject({ status: 'completed', background_process: { id: '8', status: 'running' } });
  });

  it('forge_create_background_process reports a process that cannot start', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202, body: specResponse('organizations.servers.background-processes.store', 202, { data: processResource('8', 'installing') }) },
        showProcess('8', 'fatal'),
      ],
    });
    const result = await harness.call('forge_create_background_process', { server: 3, name: 'w', command: 'php artisan nope' });
    expect(result.structuredContent).toMatchObject({ status: 'failed' });
    expect(textOf(result)).toContain('forge_get_background_process_log');
  });

  it('forge_update_background_process replaces the configuration', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_update_background_process', { server: 3, background_process: 8, name: 'w', config: '[program:w]' });
    expect(harness.requests[0]).toMatchObject({ method: 'PUT', body: { name: 'w', config: '[program:w]' } });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_background_processes' });
  });

  it('forge_run_background_process_action waits for stop', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, showProcess('8', 'stopping'), showProcess('8', 'stopped')] });
    const result = await harness.call('forge_run_background_process_action', { server: 3, background_process: 8, action: 'stop' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { action: 'stop' } });
    expect(paths()).toEqual([`POST ${PROCESSES}/8/actions`, `GET ${PROCESSES}/8`, `GET ${PROCESSES}/8`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', background_process: { status: 'stopped' } });
  });

  it('forge_run_background_process_action cannot follow a restart', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_run_background_process_action', { server: 3, background_process: 8, action: 'restart' });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_background_processes', background_process: null });
  });

  it('forge_delete_background_process waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_background_process', { server: 3, background_process: 8 });
    expect(paths()).toEqual([`DELETE ${PROCESSES}/8`, `GET ${PROCESSES}/8`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_background_processes' });
  });
});
