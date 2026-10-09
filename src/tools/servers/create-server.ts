import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { versionNumber } from '../php/shared.js';
import { formatServer, serverOutput } from './format.js';
import { readServer } from './shared.js';

const CHECK_WITH = 'forge_get_server';

const PROVIDERS = ['ocean2', 'hetzner', 'aws', 'vultr', 'akamai', 'laravel', 'custom'] as const;
type Provider = (typeof PROVIDERS)[number];

const SERVER_TYPES = ['app', 'web', 'loadbalancer', 'database', 'cache', 'worker', 'meilisearch', 'openclaw'] as const;
const DATABASE_TYPES = ['mysql84', 'mysql9', 'mariadb1011', 'mariadb114', 'postgres14', 'postgres15', 'postgres16', 'postgres17', 'postgres18'] as const;

/** Inputs accepted per provider; any other provider-specific input is rejected. */
const PROVIDER_INPUTS: Record<Provider, readonly string[]> = {
  ocean2: ['region', 'size', 'vpc', 'backups'],
  hetzner: ['region', 'size', 'vpc', 'backups'],
  aws: ['region', 'size', 'vpc', 'subnet', 'disk_size'],
  vultr: ['region', 'size', 'vpc'],
  akamai: ['region', 'size'],
  laravel: ['region', 'size', 'vpc'],
  custom: ['ip_address', 'private_ip_address', 'ssh_port', 'behind_nat', 'nat_ssh_port'],
};
const SPECIFIC = ['region', 'size', 'vpc', 'subnet', 'disk_size', 'backups', 'ip_address', 'private_ip_address', 'ssh_port', 'behind_nat', 'nat_ssh_port'] as const;

type Args = Partial<Record<(typeof SPECIFIC)[number], unknown>> & { provider: Provider };

/** The provider-specific object of the request body. */
function providerBody(args: Args): Record<string, unknown> {
  const { provider } = args;
  if (provider === 'custom') {
    if (!args.ip_address) throw new ToolInputError('A custom server needs `ip_address`.');
    return {
      ip_address: args.ip_address,
      private_ip_address: args.private_ip_address,
      ssh_port: args.ssh_port,
      behind_nat: args.behind_nat,
      nat_ssh_port: args.nat_ssh_port,
    };
  }
  if (!args.region || !args.size) {
    throw new ToolInputError(`${provider} servers need \`region\` and \`size\` (see forge_list_provider_regions and forge_list_provider_sizes).`);
  }
  const body: Record<string, unknown> = { region_id: args.region, size_id: args.size };
  if (provider === 'hetzner') {
    if (args.vpc === undefined) throw new ToolInputError('Hetzner servers need `vpc`: the ID of the private network (see forge_list_vpcs).');
    body.network_id = Number(args.vpc);
    if (args.backups !== undefined) Object.assign(body, { enable_daily_backups: args.backups, enable_weekly_backups: args.backups });
  } else if (provider === 'vultr') {
    body.network_id = args.vpc;
  } else if (args.vpc !== undefined) {
    body.vpc_uuid = args.vpc;
  }
  if (provider === 'ocean2' && args.backups !== undefined) body.enable_weekly_backups = args.backups;
  if (provider === 'aws') Object.assign(body, { subnet_uuid: args.subnet, disk_size: args.disk_size });
  return body;
}

export const createServer = defineTool({
  name: 'forge_create_server',
  title: 'Create server',
  description:
    'Provision a new server on a cloud provider (DigitalOcean "ocean2", Hetzner, AWS, Vultr, Akamai, Laravel) or connect your own VPS ("custom"). This creates billable resources at the provider: confirm the provider, region and size with the user. Find them with forge_list_server_credentials, forge_list_provider_regions and forge_list_provider_sizes. Waits until the server is ready (usually 10–15 minutes) unless `wait` is false.',
  toolset: 'servers',
  operations: ['organizations.servers.store', 'organizations.servers.show'],
  permissions: ['server:create', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  inputSchema: {
    organization: organizationInput,
    name: z.string().min(1).describe('Server name, e.g. "web-1".'),
    provider: z.enum(PROVIDERS).describe('ocean2 (DigitalOcean), hetzner, aws, vultr, akamai, laravel or custom (your own VPS).'),
    credential: idInput('Provider account (server credential) to create the server with; not used for custom. Use forge_list_server_credentials.').optional(),
    type: z.enum(SERVER_TYPES).default('app').describe('app (PHP, Nginx, database, Redis), web, worker, database, cache, loadbalancer, meilisearch…'),
    ubuntu_version: z.enum(['24.04', '26.04']).default('24.04'),
    php_version: z.string().min(1).optional().describe('PHP version to install, e.g. "8.4".'),
    database_type: z.enum(DATABASE_TYPES).optional().describe('Database server to install, e.g. "mysql84" or "postgres17".'),
    database: z.string().min(1).optional().describe('Name of a database to create.'),
    region: z.string().min(1).optional().describe('Cloud providers: region code, e.g. "fra1".'),
    size: z.string().min(1).optional().describe('Cloud providers: size code, e.g. "s-1vcpu-2gb".'),
    vpc: z.string().min(1).optional().describe('Private network ID (VPC; Hetzner: required network ID). Use forge_list_vpcs.'),
    subnet: z.string().min(1).optional().describe('AWS only: subnet ID of the VPC.'),
    disk_size: z.number().int().min(20).max(2000).optional().describe('AWS only: disk size in GB.'),
    backups: z.boolean().optional().describe('DigitalOcean and Hetzner: enable provider backups (billed by the provider).'),
    ip_address: z.string().min(1).optional().describe('Custom only: public IP address of the VPS.'),
    private_ip_address: z.string().min(1).optional().describe('Custom only: private IP address.'),
    ssh_port: z.number().int().min(1).max(65535).optional().describe('Custom only: SSH port (default 22).'),
    behind_nat: z.boolean().optional().describe('Custom only: the VPS is behind NAT.'),
    nat_ssh_port: z.number().int().min(1).max(65535).optional().describe('Custom only: forwarded SSH port when behind NAT.'),
    recipe: idInput('Recipe to run after provisioning.').optional(),
    team: idInput('Team that owns the server.').optional(),
    tags: z.array(z.string().min(1)).optional(),
    add_key_to_source_control: z.boolean().optional().describe("Add the server's SSH key to the connected source control providers (default true)."),
    ...waitInput(900),
  },
  outputSchema: {
    ...operationOutput,
    server: serverOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const unexpected = SPECIFIC.filter((field) => args[field] !== undefined && !PROVIDER_INPUTS[args.provider].includes(field));
    if (unexpected.length > 0) throw new ToolInputError(`${unexpected.map((f) => `\`${f}\``).join(', ')} not used by provider ${args.provider}.`);
    if (args.provider === 'custom' && args.credential !== undefined) throw new ToolInputError('`credential` is not used by custom servers.');
    if (args.provider !== 'custom' && args.provider !== 'laravel' && args.credential === undefined) {
      throw new ToolInputError(`${args.provider} servers need \`credential\` (see forge_list_server_credentials).`);
    }
    let phpVersion: string | undefined;
    if (args.php_version !== undefined) {
      const number = versionNumber(args.php_version);
      if (!number) throw new ToolInputError(`Unknown PHP version "${args.php_version}". Use e.g. "8.4".`);
      phpVersion = `php${number.replace('.', '')}`;
    }

    const org = organization(args.organization);
    const response = await client.post<SingleDocument | undefined>(apiPath`/orgs/${org}/servers`, {
      body: {
        name: args.name,
        provider: args.provider,
        credential_id: args.credential === undefined ? undefined : Number(args.credential),
        type: args.type,
        ubuntu_version: args.ubuntu_version,
        php_version: phpVersion,
        database_type: args.database_type,
        database: args.database,
        recipe_id: args.recipe === undefined ? undefined : Number(args.recipe),
        team_id: args.team === undefined ? undefined : Number(args.team),
        tags: args.tags,
        add_key_to_source_control: args.add_key_to_source_control,
        [args.provider]: providerBody(args),
      },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const server = initial ? formatServer(initial, false) : null;
    const action = `create the server ${args.name}`;
    if (args.provider === 'custom') {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, server },
        summary: `Forge registered the custom server ${args.name}${server ? ` (ID ${server.id})` : ''}. Run the provisioning command shown in the Forge dashboard on the VPS as root; the server becomes ready when it finishes (check with ${CHECK_WITH}).`,
      };
    }
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, server },
        summary: `Forge accepted the request to ${action}${server ? ` (ID ${server.id})` : ''}; provisioning takes 10–15 minutes. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readServer(client, org, initial.id, signal),
      phase: (current) => (current.is_ready === true ? 'completed' : 'pending'),
      describe: (current) => `Server ${current.name} is provisioning`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: `Server ID: ${initial.id}.`,
    });
    return { structured: { ...done.structured, server: formatServer(result.value ?? initial, false) }, summary: done.summary };
  },
});
