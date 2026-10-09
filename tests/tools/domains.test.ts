import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SITE = '/api/orgs/acme/servers/3/sites/7';
const DOMAIN = `${SITE}/domains/12`;
const CERTS = `${DOMAIN}/certificates`;
const scope = { server: 3, site: 7 };
const domainScope = { ...scope, domain: 12 };

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const domain = (attributes: Record<string, unknown>) =>
  specSchema('DomainRecordResource', { id: '12', attributes: { name: 'www.example.com', type: 'alias', ...attributes } });
const domainShow = (attributes: Record<string, unknown>) => ({
  body: specResponse('organizations.servers.sites.domains.show', 200, { data: domain(attributes) }),
});
const certificate = (attributes: Record<string, unknown>) =>
  specSchema('CertificateResource', { id: '40', attributes: { type: 'letsencrypt', ...attributes } });
const certificateShow = (attributes: Record<string, unknown>) => ({
  body: specResponse('organizations.servers.sites.domains.certificates.show', 200, { data: certificate(attributes) }),
});

describe('domains', () => {
  it('forge_list_domains filters by status and type', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.servers.sites.domains.index', 200, { data: [domain({ status: 'enabled' })] }) }],
    });
    const result = await harness.call('forge_list_domains', { ...scope, status: 'enabled', type: 'alias' });
    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe(`${SITE}/domains`);
    expect(url.searchParams.get('filter[status]')).toBe('enabled');
    expect(url.searchParams.get('filter[type]')).toBe('alias');
    expect(result.structuredContent).toMatchObject({ domains: [{ id: '12', name: 'www.example.com', status: 'enabled', type: 'alias' }] });
  });

  it('forge_get_domain returns the DNS records to configure', async () => {
    harness = await createHarness({
      responses: [
        domainShow({ status: 'pending' }),
        {
          body: specResponse('organizations.servers.sites.domains.configurations', 200, {
            data: [specSchema('DomainRecordConfigurationResource', { attributes: { type: 'A', name: 'www', value: '192.0.2.10', ttl: 300 } })],
          }),
        },
      ],
    });
    const result = await harness.call('forge_get_domain', domainScope);
    expect(paths()).toEqual([`GET ${DOMAIN}`, `GET ${DOMAIN}/configurations`]);
    expect(result.structuredContent).toMatchObject({
      domain: { id: '12', status: 'pending' },
      dns_records: [{ type: 'A', name: 'www', value: '192.0.2.10', ttl: 300 }],
    });
    expect(textOf(result)).toContain('needs 1 DNS record(s)');
  });

  it('forge_add_domain waits until the domain is enabled', async () => {
    harness = await createHarness({
      responses: [
        { status: 202, body: specResponse('organizations.servers.sites.domains.store', 202, { data: domain({ status: 'pending' }) }) },
        domainShow({ status: 'connecting' }),
        domainShow({ status: 'enabled' }),
      ],
    });
    const result = await harness.call('forge_add_domain', { ...scope, name: 'www.example.com', www_redirect_type: 'to-www' });
    expect(harness.requests[0]).toMatchObject({
      method: 'POST',
      body: { name: 'www.example.com', www_redirect_type: 'to-www', allow_wildcard_subdomains: false },
    });
    expect(paths().slice(1)).toEqual([`GET ${DOMAIN}`, `GET ${DOMAIN}`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', domain: { status: 'enabled' } });
  });

  it('forge_add_domain points to the DNS records when the domain stays pending', async () => {
    harness = await createHarness({
      responses: [
        { status: 202, body: specResponse('organizations.servers.sites.domains.store', 202, { data: domain({ status: 'pending' }) }) },
        domainShow({ status: 'pending' }),
        domainShow({ status: 'pending' }),
      ],
    });
    const result = await harness.call('forge_add_domain', { ...scope, name: 'www.example.com', timeout_seconds: 10 });
    expect(result.structuredContent).toMatchObject({ status: 'in_progress' });
    expect(textOf(result)).toContain('Check the DNS records with forge_get_domain');
  });

  it('forge_update_domain waits until the new settings are applied', async () => {
    harness = await createHarness({
      responses: [
        { body: specResponse('organizations.servers.sites.domains.update', 200, { data: domain({ status: 'updating', www_redirect_type: 'none' }) }) },
        domainShow({ status: 'enabled', www_redirect_type: 'from-www' }),
      ],
    });
    const result = await harness.call('forge_update_domain', { ...domainScope, www_redirect_type: 'from-www' });
    expect(harness.requests[0]).toMatchObject({ method: 'PATCH', body: { www_redirect_type: 'from-www' } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', domain: { www_redirect_type: 'from-www' } });
  });

  it('forge_run_domain_action marks a domain as primary', async () => {
    harness = await createHarness({ responses: [{ status: 202 }, domainShow({ type: 'alias' }), domainShow({ type: 'primary' })] });
    const result = await harness.call('forge_run_domain_action', { ...domainScope, action: 'mark-as-primary' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { action: 'mark-as-primary' } });
    expect(harness.requests[0]?.url.pathname).toBe(`${DOMAIN}/actions`);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_domain' });
  });

  it('forge_delete_domain waits until the domain is gone', async () => {
    harness = await createHarness({ responses: [{ status: 204 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_domain', domainScope);
    expect(paths()).toEqual([`DELETE ${DOMAIN}`, `GET ${DOMAIN}`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_domains' });
  });
});

describe('certificates', () => {
  it('forge_list_certificates lists the site or one domain', async () => {
    const list = (operationId: string) => ({
      body: specResponse(operationId, 200, { data: [certificate({ status: 'installed', active: true })] }),
    });
    harness = await createHarness({
      responses: [list('organizations.servers.sites.certificates.index'), list('organizations.servers.sites.domains.certificates.index')],
    });
    const all = await harness.call('forge_list_certificates', scope);
    await harness.call('forge_list_certificates', { ...scope, domain: 12 });
    expect(paths()).toEqual([`GET ${SITE}/certificates`, `GET ${CERTS}`]);
    expect(all.structuredContent).toMatchObject({ certificates: [{ id: '40', status: 'installed', active: true }] });
    expect(textOf(all)).toContain('1 active');
  });

  it('forge_get_certificate returns the active certificate, or null when there is none', async () => {
    harness = await createHarness({
      responses: [
        { body: specResponse('organizations.servers.sites.domains.certificates.active', 200, { data: certificate({ active: true }) }) },
        { status: 404, body: { message: 'Not found.' } },
        certificateShow({ status: 'installed' }),
      ],
    });
    expect((await harness.call('forge_get_certificate', domainScope)).structuredContent).toMatchObject({ certificate: { id: '40', active: true } });
    expect((await harness.call('forge_get_certificate', domainScope)).structuredContent).toEqual({ certificate: null });
    await harness.call('forge_get_certificate', { ...domainScope, certificate: 40 });
    expect(paths()).toEqual([`GET ${CERTS}/active`, `GET ${CERTS}/active`, `GET ${CERTS}/40`]);
  });

  it("forge_create_certificate issues a Let's Encrypt certificate and waits until it is installed", async () => {
    harness = await createHarness({
      responses: [
        {
          status: 202,
          body: specResponse('organizations.servers.sites.domains.certificates.store', 202, {
            data: certificate({ request_status: 'verifying', status: 'installing' }),
          }),
        },
        certificateShow({ request_status: 'created', status: 'installing' }),
        certificateShow({ request_status: 'created', status: 'installed', active: true }),
      ],
    });
    const result = await harness.call('forge_create_certificate', { ...domainScope, key_type: 'ecdsa' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { type: 'letsencrypt', letsencrypt: { key_type: 'ecdsa' } } });
    expect(paths().slice(1)).toEqual([`GET ${CERTS}/40`, `GET ${CERTS}/40`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', certificate: { status: 'installed', active: true } });
  });

  it("explains Let's Encrypt failures", async () => {
    harness = await createHarness({
      responses: [
        {
          status: 202,
          body: specResponse('organizations.servers.sites.domains.certificates.store', 202, {
            data: certificate({ request_status: 'verifying', status: 'installing' }),
          }),
        },
        certificateShow({ request_status: 'verifying', status: 'failed' }),
      ],
    });
    const result = await harness.call('forge_create_certificate', domainScope);
    expect(result.structuredContent).toMatchObject({ status: 'failed' });
    expect(textOf(result)).toContain('DNS does not point to the server');
  });

  it.each([
    [{ type: 'existing', certificate: 'CERT', private_key: 'KEY', enable: true }, { type: 'existing', enable: true, existing: { certificate: 'CERT', key: 'KEY' } }],
    [{ type: 'csr', csr_domain: 'example.com', csr_country: 'IT' }, { type: 'csr', csr: { domain: 'example.com', country: 'IT' } }],
    [{ type: 'clone', clone_certificate_id: 39 }, { type: 'clone', clone: { certificate_id: 39 } }],
  ])('forge_create_certificate builds the %j request', async (args, body) => {
    harness = await createHarness({
      responses: [{ status: 202, body: specResponse('organizations.servers.sites.domains.certificates.store', 202, { data: certificate({}) }) }],
    });
    await harness.call('forge_create_certificate', { ...domainScope, ...args, wait: false });
    expect(harness.requests[0]?.body).toEqual(body);
  });

  it.each([
    [{ type: 'existing', certificate: 'CERT' }, 'needs both'],
    [{ type: 'csr' }, 'needs `csr_domain`'],
    [{ type: 'clone' }, 'needs `clone_certificate_id`'],
  ])('forge_create_certificate validates %j before calling Forge', async (args, message) => {
    harness = await createHarness();
    const result = await harness.call('forge_create_certificate', { ...domainScope, ...args });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('forge_run_certificate_action waits until the certificate is active', async () => {
    harness = await createHarness({
      responses: [{ status: 202 }, certificateShow({ request_status: 'created', status: 'installed', active: true })],
    });
    const result = await harness.call('forge_run_certificate_action', { ...domainScope, certificate: 40, action: 'enable' });
    expect(paths()).toEqual([`POST ${CERTS}/40/actions`, `GET ${CERTS}/40`]);
    expect(harness.requests[0]?.body).toEqual({ action: 'enable' });
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_certificate' });
  });

  it('forge_delete_certificate waits until the certificate is gone', async () => {
    harness = await createHarness({ responses: [{ status: 202 }, certificateShow({ status: 'deleting' }), { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_certificate', { ...domainScope, certificate: 40 });
    expect(paths()).toEqual([`DELETE ${CERTS}/40`, `GET ${CERTS}/40`, `GET ${CERTS}/40`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_certificates' });
  });
});

describe('Nginx configuration of a domain', () => {
  it('reads and replaces the domain configuration with `domain`', async () => {
    const config = (content: string) => ({
      body: specResponse('organizations.servers.sites.domains.nginx.show', 200, { data: { attributes: { content } } }),
    });
    harness = await createHarness({ responses: [config('a'), { status: 202 }, config('b')] });
    await harness.call('forge_get_site_nginx_config', { ...scope, domain: 12 });
    const result = await harness.call('forge_update_site_nginx_config', { ...scope, domain: 12, config: 'b' });
    expect(paths()).toEqual([`GET ${DOMAIN}/nginx`, `PUT ${DOMAIN}/nginx`, `GET ${DOMAIN}/nginx`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_site_nginx_config' });
  });
});
