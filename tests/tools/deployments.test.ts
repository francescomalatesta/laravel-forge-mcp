import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SITE = '/api/orgs/acme/servers/3/sites/7';
const scope = { server: 3, site: 7 };

const deployment = (status: string, id = '55') =>
  specSchema('DeploymentResource', {
    id,
    attributes: { status, commit: { hash: 'abc123', message: 'Fix checkout', author: 'Taylor', branch: 'main' } },
  });

const deploymentBody = (status: string) => specResponse('organizations.servers.sites.deployments.show', 200, { data: deployment(status) });
const logBody = (output: string) =>
  specResponse('organizations.servers.sites.deployments.log.show', 200, { data: { attributes: { output } } });

describe('forge_list_deployments', () => {
  it('lists the deployments of a site with filters, newest first', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.servers.sites.deployments.index', 200, { data: [deployment('finished')] }) }],
    });
    const result = await harness.call('forge_list_deployments', { ...scope, commit_author: 'Taylor' });

    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe(`${SITE}/deployments`);
    expect(url.searchParams.get('sort')).toBe('-created_at');
    expect(url.searchParams.get('filter[commit_author]')).toBe('Taylor');
    expect(url.searchParams.has('include')).toBe(false);
    expect(result.structuredContent).toMatchObject({
      deployments: [{ id: '55', status: 'finished', commit_hash: 'abc123', commit_message: 'Fix checkout', branch: 'main' }],
    });
  });

  it('lists the deployments of every site on a server', async () => {
    harness = await createHarness({ responses: [{ body: specResponse('organizations.servers.deployments.index') }] });
    await harness.call('forge_list_deployments', { server: 3 });
    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe('/api/orgs/acme/servers/3/deployments');
    expect(url.searchParams.get('include')).toBe('site,initiator');
  });
});

describe('forge_get_deployment', () => {
  it('returns the deployment with the end of its log', async () => {
    harness = await createHarness({ responses: [{ body: deploymentBody('failed') }, { body: logBody('a\nb\nc\nd') }] });
    const result = await harness.call('forge_get_deployment', { ...scope, deployment: 55, log_lines: 2 });

    expect(harness.requests.map((r) => r.url.pathname)).toEqual([`${SITE}/deployments/55`, `${SITE}/deployments/55/log`]);
    expect(result.structuredContent).toMatchObject({
      deployment: { id: '55', status: 'failed' },
      log: 'c\nd',
      log_truncated: true,
      log_total_lines: 4,
      log_unavailable_reason: null,
    });
  });

  it('still returns the deployment when the token cannot read logs', async () => {
    harness = await createHarness({
      responses: [{ body: deploymentBody('finished') }, { status: 403, body: { message: 'This action is unauthorized.' } }],
    });
    const result = await harness.call('forge_get_deployment', { ...scope, deployment: 55 });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ log: null, log_unavailable_reason: expect.stringContaining('site:manage-deploys') });
  });
});

describe('forge_get_deployment_status', () => {
  it('reports when nothing is running', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.servers.sites.deployments.status.show', 200, { data: { attributes: { status: null } } }) }],
    });
    const result = await harness.call('forge_get_deployment_status', scope);
    expect(harness.requests[0]?.url.pathname).toBe(`${SITE}/deployments/status`);
    expect(result.structuredContent).toMatchObject({ status: null });
    expect(textOf(result)).toMatch(/^No deployment is currently running/);
  });
});

describe('forge_deploy_site', () => {
  const queued = () => specResponse('organizations.servers.sites.deployments.store', 202, { data: deployment('queued') });

  it('returns right away when wait is false', async () => {
    harness = await createHarness({ responses: [{ status: 202, body: queued() }] });
    const result = await harness.call('forge_deploy_site', { ...scope, wait: false });

    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]).toMatchObject({ method: 'POST' });
    expect(harness.requests[0]?.url.pathname).toBe(`${SITE}/deployments`);
    expect(result.structuredContent).toMatchObject({ deployment: { id: '55', status: 'queued' }, finished: false });
    expect(textOf(result)).toContain('queued');
  });

  it('waits for the deployment to finish and returns the log', async () => {
    harness = await createHarness({
      responses: [
        { status: 202, body: queued() },
        { body: deploymentBody('deploying') },
        { body: deploymentBody('finished') },
        { body: logBody('Deployment finished') },
      ],
    });
    const result = await harness.call('forge_deploy_site', scope);

    expect(harness.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      `POST ${SITE}/deployments`,
      `GET ${SITE}/deployments/55`,
      `GET ${SITE}/deployments/55`,
      `GET ${SITE}/deployments/55/log`,
    ]);
    expect(result.structuredContent).toMatchObject({ finished: true, succeeded: true, log: 'Deployment finished' });
    expect(textOf(result)).toMatch(/^Deployment 55 finished successfully/);
  });

  it('reports failed deployments with the log', async () => {
    harness = await createHarness({
      responses: [{ status: 202, body: queued() }, { body: deploymentBody('failed') }, { body: logBody('npm ERR! build failed') }],
    });
    const result = await harness.call('forge_deploy_site', scope);
    expect(result.structuredContent).toMatchObject({ finished: true, succeeded: false, log: 'npm ERR! build failed' });
    expect(textOf(result)).toContain('ended with status "failed"');
  });

  it('stops waiting after the timeout', async () => {
    // 10 seconds at one poll every 5 seconds = 2 polls.
    harness = await createHarness({
      responses: [{ status: 202, body: queued() }, { body: deploymentBody('deploying') }, { body: deploymentBody('deploying') }],
    });
    const result = await harness.call('forge_deploy_site', { ...scope, timeout_seconds: 10 });
    expect(harness.requests).toHaveLength(3);
    expect(result.structuredContent).toMatchObject({ finished: false, log: null });
    expect(textOf(result)).toContain('still deploying after 10s');
  });

  it('handles an accepted request without a deployment in the body', async () => {
    harness = await createHarness({ responses: [{ status: 202 }] });
    const result = await harness.call('forge_deploy_site', scope);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ deployment: null, finished: false });
    expect(textOf(result)).toContain('forge_list_deployments');
  });

  it('sends progress notifications while waiting', async () => {
    harness = await createHarness({
      responses: [{ status: 202, body: queued() }, { body: deploymentBody('finished') }, { body: logBody('ok') }],
    });
    const messages: string[] = [];
    await harness.client.callTool({ name: 'forge_deploy_site', arguments: scope }, undefined, {
      onprogress: (progress) => {
        messages.push(progress.message ?? '');
      },
    });
    expect(messages).toEqual(['Deployment 55 is queued']);
  });
});

describe('deployment configuration tools', () => {
  it('forge_reset_deployment_state deletes the deployment status', async () => {
    harness = await createHarness({ responses: [{ status: 202 }] });
    const result = await harness.call('forge_reset_deployment_state', scope);
    expect(harness.requests[0]).toMatchObject({ method: 'DELETE' });
    expect(harness.requests[0]?.url.pathname).toBe(`${SITE}/deployments/status`);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_get_deployment_status' });
  });

  it('forge_get_deployment_script and forge_update_deployment_script', async () => {
    const script = (content: string) =>
      specResponse('organizations.servers.sites.deployments.script.show', 200, { data: { attributes: { content, auto_source: true } } });
    harness = await createHarness({ responses: [{ body: script('cd /home/forge\ngit pull') }, { body: script('php artisan migrate') }] });

    const current = await harness.call('forge_get_deployment_script', scope);
    expect(current.structuredContent).toEqual({ content: 'cd /home/forge\ngit pull', auto_source: true });

    const updated = await harness.call('forge_update_deployment_script', { ...scope, content: 'php artisan migrate' });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { content: 'php artisan migrate' } });
    expect(updated.structuredContent).toEqual({ content: 'php artisan migrate', auto_source: true });
  });

  it('forge_set_push_to_deploy enables and disables quick deploy', async () => {
    harness = await createHarness({ responses: [{ status: 202 }, { status: 202 }] });
    await harness.call('forge_set_push_to_deploy', { ...scope, enabled: true });
    await harness.call('forge_set_push_to_deploy', { ...scope, enabled: false });
    expect(harness.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      `POST ${SITE}/deployments/push-to-deploy`,
      `DELETE ${SITE}/deployments/push-to-deploy`,
    ]);
  });

  it('deployment webhooks can be listed, read, created and deleted', async () => {
    const webhook = specSchema('DeploymentWebhookResource', { id: '4', attributes: { url: 'https://hooks.example.com/deploy' } });
    harness = await createHarness({
      responses: [
        { body: specResponse('organizations.servers.sites.webhooks.index', 200, { data: [webhook] }) },
        { body: specResponse('organizations.servers.sites.webhooks.show', 200, { data: webhook }) },
        { status: 202 },
        { status: 202 },
      ],
    });

    const list = await harness.call('forge_list_deployment_webhooks', scope);
    expect(list.structuredContent).toMatchObject({ webhooks: [{ id: '4', url: 'https://hooks.example.com/deploy' }] });
    await harness.call('forge_list_deployment_webhooks', { ...scope, webhook: 4 });
    await harness.call('forge_create_deployment_webhook', { ...scope, url: 'https://hooks.example.com/new' });
    await harness.call('forge_delete_deployment_webhook', { ...scope, webhook: 4 });

    expect(harness.requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      `GET ${SITE}/webhooks`,
      `GET ${SITE}/webhooks/4`,
      `POST ${SITE}/webhooks`,
      `DELETE ${SITE}/webhooks/4`,
    ]);
    expect(harness.requests[2]?.body).toEqual({ url: 'https://hooks.example.com/new' });
  });

  it('deploy keys can be read, created and deleted', async () => {
    const key = specResponse('organizations.servers.sites.deploy-key.show', 200, { data: { attributes: { key: 'ssh-ed25519 AAAA' } } });
    harness = await createHarness({ responses: [{ body: key }, { body: key }, { status: 204 }] });

    expect((await harness.call('forge_get_deploy_key', scope)).structuredContent).toEqual({ key: 'ssh-ed25519 AAAA' });
    expect((await harness.call('forge_create_deploy_key', scope)).structuredContent).toEqual({ key: 'ssh-ed25519 AAAA' });
    expect((await harness.call('forge_delete_deploy_key', scope)).structuredContent).toEqual({ deleted: true });
    expect(harness.requests.map((r) => r.method)).toEqual(['GET', 'POST', 'DELETE']);
  });
});

describe('deploy hook tools expose secrets', () => {
  it('are not registered unless FORGE_ALLOW_SECRETS is enabled', async () => {
    harness = await createHarness();
    const names = (await harness.client.listTools()).tools.map((tool) => tool.name);
    expect(names).not.toContain('forge_get_deploy_hook');
    expect(names).not.toContain('forge_regenerate_deploy_hook');
  });

  it('return the URL when allowed', async () => {
    const hook = (url: string) => specResponse('organizations.servers.sites.deployments.deploy-hook.show', 200, { data: { attributes: { url } } });
    harness = await createHarness({
      env: { FORGE_ALLOW_SECRETS: 'true' },
      responses: [{ body: hook('https://forge/hook?token=old') }, { body: hook('https://forge/hook?token=new') }],
    });
    expect((await harness.call('forge_get_deploy_hook', scope)).structuredContent).toEqual({ url: 'https://forge/hook?token=old' });
    expect((await harness.call('forge_regenerate_deploy_hook', scope)).structuredContent).toEqual({ url: 'https://forge/hook?token=new' });
    expect(harness.requests.map((r) => r.method)).toEqual(['GET', 'PUT']);
  });
});

describe('read-only mode', () => {
  it('registers only read-only deployment tools', async () => {
    harness = await createHarness({ env: { FORGE_READ_ONLY: 'true' } });
    const tools = (await harness.client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).not.toContain('forge_deploy_site');
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });
});
