import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { pick } from '../shared/schemas.js';
import { DOMAIN_NOT_FOUND_HINT, domainOutput, domainPath, domainScopeInput, formatDomain, readDomain } from './shared.js';

const dnsRecord = z.looseObject({
  type: z.string().nullable().describe('A, CNAME or TXT.'),
  name: z.string().nullable(),
  value: z.string().nullable(),
  ttl: z.number().int().nullable(),
});

export const getDomain = defineTool({
  name: 'forge_get_domain',
  title: 'Get domain',
  description:
    'Get a domain of a site with the DNS records that must exist at the DNS provider for it to work (and for Let\'s Encrypt to issue certificates). Use it when a domain stays "pending" or "connecting".',
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.show', 'organizations.servers.sites.domains.configurations'],
  permissions: ['site:meta'],
  readOnly: true,
  notFoundHint: DOMAIN_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    include_dns: z.boolean().default(true).describe('Also return the DNS records to configure.'),
  },
  outputSchema: {
    domain: domainOutput,
    dns_records: z.array(dnsRecord).nullable().describe('DNS records to configure, or null when not requested.'),
  },
  async handler(args, { client, organization, signal }) {
    const path = domainPath(organization(args.organization), args.server, args.site, args.domain);
    const [domain, dns] = await Promise.all([
      readDomain(client, path, signal),
      args.include_dns ? client.get<CollectionDocument>(`${path}/configurations`, { signal }) : Promise.resolve(undefined),
    ]);
    const records = dns
      ? flattenCollection(dns.data).items.map((record) => pick(record, ['type', 'name', 'value', 'ttl']) as z.output<typeof dnsRecord>)
      : null;
    const formatted = formatDomain(domain);
    return {
      structured: { domain: formatted, dns_records: records },
      summary: `Domain ${formatted.name} is ${formatted.status}.${
        records && records.length > 0 ? ` It needs ${records.length} DNS record(s) at the DNS provider.` : ''
      }`,
    };
  },
});
