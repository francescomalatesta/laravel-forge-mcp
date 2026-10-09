import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const SITE = `${SERVER}/sites/7`;
const env = { FORGE_TOOLSETS: 'core,security' };
const PASSWORD = 'very-secret-password';
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const gone = { status: 404, body: { message: 'Not found.' } };

describe('firewall rules', () => {
  const rule = (id: string, status = 'installed') =>
    specSchema('RuleResource', { id, attributes: { name: 'MySQL', port: '3306', type: 'allow', ip_address: '203.0.113.4', status } });
  const ruleList = (...items: ReturnType<typeof rule>[]) => ({ body: specResponse('organizations.servers.firewall-rules.index', 200, { data: items }) });

  it('forge_list_firewall_rules lists with filters', async () => {
    harness = await createHarness({ env, responses: [ruleList(rule('4'))] });
    const result = await harness.call('forge_list_firewall_rules', { server: 3, port: '3306' });
    expect(harness.requests[0]?.url.searchParams.get('filter[port]')).toBe('3306');
    expect(textOf(result)).toMatch(/^Found 1 firewall rule\(s\): allow 3306 from 203\.0\.113\.4 \(4\)\./);
  });

  it('forge_create_firewall_rule finds the new rule and waits until installed', async () => {
    harness = await createHarness({
      env,
      responses: [ruleList(rule('3')), { status: 202 }, ruleList(rule('4', 'installing'), rule('3')), ruleList(rule('4'), rule('3'))],
    });
    const result = await harness.call('forge_create_firewall_rule', { server: 3, name: 'MySQL', port: '3306', ip_address: '203.0.113.4' });
    expect(harness.requests[0]?.url.searchParams.get('filter[name]')).toBe('MySQL');
    expect(harness.requests[1]).toMatchObject({ method: 'POST', body: { name: 'MySQL', port: '3306', ip_address: '203.0.113.4', type: 'allow' } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', rule: { id: '4', status: 'installed' } });
  });

  it('forge_delete_firewall_rule waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, gone] });
    const result = await harness.call('forge_delete_firewall_rule', { server: 3, rule: 4 });
    expect(paths()).toEqual([`DELETE ${SERVER}/firewall-rules/4`, `GET ${SERVER}/firewall-rules/4`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_firewall_rules' });
  });
});

describe('security rules', () => {
  const RULES = `${SITE}/security-rules`;
  const rule = (id: string, attributes: Record<string, unknown> = {}) =>
    specSchema('SecurityRuleResource', { id, attributes: { name: 'Staging', path: null, status: 'installed', ...attributes } });
  const show = (item: ReturnType<typeof rule>) => ({ body: specResponse('organizations.servers.sites.security-rules.show', 200, { data: item }) });
  const credentials = [{ username: 'team', password: PASSWORD }];

  it('forge_create_security_rule protects the site and never returns the password', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202, body: specResponse('organizations.servers.sites.security-rules.store', 202, { data: rule('2', { status: 'installing' }) }) },
        show(rule('2')),
      ],
    });
    const result = await harness.call('forge_create_security_rule', { server: 3, site: 7, name: 'Staging', credentials });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { name: 'Staging', credentials } });
    expect(paths()).toEqual([`POST ${RULES}`, `GET ${RULES}/2`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', rule: { id: '2', status: 'installed' } });
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });

  it('forge_update_security_rule keeps the name and waits for the new path', async () => {
    harness = await createHarness({ env, responses: [show(rule('2')), { status: 202 }, show(rule('2', { path: '/admin' }))] });
    const result = await harness.call('forge_update_security_rule', { server: 3, site: 7, rule: 2, path: '/admin', credentials });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { name: 'Staging', path: '/admin', credentials } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', rule: { path: '/admin' } });
  });

  it('forge_update_security_rule cannot verify credential-only changes', async () => {
    harness = await createHarness({ env, responses: [show(rule('2')), { status: 202 }] });
    const result = await harness.call('forge_update_security_rule', { server: 3, site: 7, rule: 2, credentials });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_security_rules', rule: null });
    expect(textOf(result)).toContain('cannot be verified');
  });

  it('forge_delete_security_rule waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, gone] });
    const result = await harness.call('forge_delete_security_rule', { server: 3, site: 7, rule: 2 });
    expect(paths()).toEqual([`DELETE ${RULES}/2`, `GET ${RULES}/2`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_security_rules' });
  });
});

describe('redirect rules', () => {
  const REDIRECTS = `${SITE}/redirect-rules`;
  const redirect = (id: string, status = 'installed') =>
    specSchema('RedirectRuleResource', { id, attributes: { from: '/old', to: '/new', type: 'permanent', status } });
  const redirectList = (...items: ReturnType<typeof redirect>[]) => ({
    body: specResponse('organizations.servers.sites.redirect-rules.index', 200, { data: items }),
  });

  it('forge_create_redirect_rule finds the new rule by source path', async () => {
    harness = await createHarness({ env, responses: [redirectList(), { status: 202 }, redirectList(redirect('9'))] });
    const result = await harness.call('forge_create_redirect_rule', { server: 3, site: 7, from: '/old', to: '/new' });
    expect(harness.requests[0]?.url.searchParams.get('filter[from]')).toBe('/old');
    expect(harness.requests[1]).toMatchObject({ method: 'POST', body: { from: '/old', to: '/new', type: 'permanent' } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', rule: { id: '9' } });
  });

  it('forge_list_redirect_rules filters by type', async () => {
    harness = await createHarness({ env, responses: [redirectList(redirect('9'))] });
    const result = await harness.call('forge_list_redirect_rules', { server: 3, site: 7, type: 'permanent' });
    expect(harness.requests[0]?.url.searchParams.get('filter[type]')).toBe('permanent');
    expect(result.structuredContent).toMatchObject({ rules: [{ id: '9', from: '/old' }] });
  });

  it('forge_delete_redirect_rule waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, gone] });
    await harness.call('forge_delete_redirect_rule', { server: 3, site: 7, rule: 9 });
    expect(paths()).toEqual([`DELETE ${REDIRECTS}/9`, `GET ${REDIRECTS}/9`]);
  });

  it('forge_reorder_redirect_rules sends the IDs in order', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_reorder_redirect_rules', { server: 3, site: 7, rules: [12, '9'] });
    expect(harness.requests[0]).toMatchObject({ method: 'PUT', body: { redirects: [12, 9] } });
    expect(harness.requests[0]?.url.pathname).toBe(`${REDIRECTS}/reorder`);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_export_redirect_rules' });
  });

  it('forge_export_redirect_rules returns the CSV', async () => {
    const csv = 'from,to,type\n/a,/b,permanent\n/c,/d,redirect\n';
    harness = await createHarness({ env, responses: [{ text: csv, headers: { 'content-type': 'text/csv' } }] });
    const result = await harness.call('forge_export_redirect_rules', { server: 3, site: 7 });
    expect(harness.requests[0]?.headers.get('accept')).toBe('text/csv');
    expect(result.structuredContent).toEqual({ csv, rules: 2 });
  });

  it('forge_import_redirect_rules uploads the CSV and reports skipped rows', async () => {
    const csv = 'from,to,type\n/a,/b,permanent\n/a,/b,permanent\n';
    const duplicate = { line: '3', reason: 'Repeats an earlier row in the file.', from: '/a', to: '/b', type: 'permanent' };
    harness = await createHarness({ env, responses: [{ status: 202, body: { imported: 1, invalid: [], duplicates: [duplicate] } }] });
    const result = await harness.call('forge_import_redirect_rules', { server: 3, site: 7, csv, mode: 'append' });
    const form = harness.requests[0]?.body as FormData;
    expect(harness.requests[0]?.url.pathname).toBe(`${REDIRECTS}/import`);
    expect(form.get('mode')).toBe('append');
    expect(await (form.get('file') as Blob).text()).toBe(csv);
    expect(result.structuredContent).toMatchObject({ status: 'queued', imported: 1, duplicates: [duplicate] });
    expect(textOf(result)).toMatch(/^Imported 1 redirect rule\(s\); skipped 0 invalid and 1 duplicate row\(s\)/);
  });

  it('forge_import_redirect_rules requires the header row', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_import_redirect_rules', { server: 3, site: 7, csv: '/a,/b,permanent', mode: 'append' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('from,to,type');
  });
});

describe('SSH keys', () => {
  const KEYS = `${SERVER}/ssh-keys`;
  const key = (id: string, status = 'installed') => specSchema('KeyResource', { id, attributes: { name: 'Jane laptop', user: 'forge', status } });
  const keyList = (...items: ReturnType<typeof key>[]) => ({ body: specResponse('organizations.servers.ssh-keys.index', 200, { data: items }) });
  const PUBLIC = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample jane@laptop';

  it('forge_add_ssh_key adds a key and waits until installed', async () => {
    harness = await createHarness({ env, responses: [keyList(), { status: 202 }, keyList(key('6', 'installing')), keyList(key('6'))] });
    const result = await harness.call('forge_add_ssh_key', { server: 3, name: 'Jane laptop', key: PUBLIC });
    expect(harness.requests[1]).toMatchObject({ method: 'POST', body: { name: 'Jane laptop', key: PUBLIC } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', ssh_key: { id: '6', user: 'forge' } });
  });

  it('forge_add_ssh_key refuses private keys', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_add_ssh_key', { server: 3, name: 'x', key: '-----BEGIN OPENSSH PRIVATE KEY-----' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('never a private key');
  });

  it('forge_list_ssh_keys and forge_delete_ssh_key', async () => {
    harness = await createHarness({ env, responses: [keyList(key('6')), { status: 202 }, gone] });
    const list = await harness.call('forge_list_ssh_keys', { server: 3, user: 'forge' });
    expect(list.structuredContent).toMatchObject({ keys: [{ id: '6', name: 'Jane laptop' }] });
    const deleted = await harness.call('forge_delete_ssh_key', { server: 3, key: 6 });
    expect(paths()).toEqual([`GET ${KEYS}`, `DELETE ${KEYS}/6`, `GET ${KEYS}/6`]);
    expect(deleted.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_ssh_keys' });
  });

  it('forge_get_server_public_key and forge_regenerate_server_key', async () => {
    const serverKey = (fingerprint: string) => ({ data: { attributes: { public_key: 'ssh-ed25519 AAAA forge@web', fingerprint } } });
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.key.show', 200, serverKey('SHA256:old')) },
        { body: specResponse('organizations.servers.key.update', 200, serverKey('SHA256:new')) },
      ],
    });
    const current = await harness.call('forge_get_server_public_key', { server: 3 });
    expect(current.structuredContent).toEqual({ public_key: 'ssh-ed25519 AAAA forge@web', fingerprint: 'SHA256:old' });
    const regenerated = await harness.call('forge_regenerate_server_key', { server: 3 });
    expect(paths()).toEqual([`GET ${SERVER}/key`, `PUT ${SERVER}/key`]);
    expect(regenerated.structuredContent).toMatchObject({ fingerprint: 'SHA256:new' });
  });
});
