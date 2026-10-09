import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { formatSite, siteOutput } from './format.js';
import { PHP_VERSIONS, SITE_TYPES, SOURCE_CONTROL_PROVIDERS, readSite, sitePhase } from './shared.js';

const CHECK_WITH = 'forge_get_site';

const sharedPath = z.object({
  from: z.string().min(1).describe("Path relative to the project's root directory on the server."),
  to: z.string().min(1).describe("Path relative to the release directory to link it to."),
});

export const createSite = defineTool({
  name: 'forge_create_site',
  title: 'Create site',
  description:
    'Create a site (virtual host) on a server, optionally installing a Git repository and connecting a database. Waits until Forge finishes installing it unless `wait` is false. Find database and source-control IDs with the related list tools; deploy it afterwards with forge_deploy_site.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.store', 'organizations.sites.show'],
  permissions: ['site:create', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: 'Check the server ID with forge_list_servers.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).describe('Primary domain of the site, e.g. "example.com".'),
    type: z.enum(SITE_TYPES).default('laravel').describe('Application type.'),
    domain_mode: z
      .enum(['custom', 'on-forge'])
      .optional()
      .describe('"custom" for your own domain, "on-forge" for a Forge-provided domain.'),
    www_redirect_type: z.enum(['from-www', 'to-www', 'none']).optional().describe('www redirection for the domain.'),
    allow_wildcard_subdomains: z.boolean().optional(),
    php_version: z.enum(PHP_VERSIONS).optional().describe('PHP version; the server default when omitted.'),
    web_directory: z.string().min(1).optional().describe('Public directory relative to the root, e.g. "/public".'),
    root_directory: z.string().min(1).optional().describe('Project root directory.'),
    is_isolated: z.boolean().optional().describe('Run the site as its own Linux user (website isolation).'),
    isolated_user: z
      .string()
      .regex(/^[a-z][-a-z0-9_]*$/)
      .max(32)
      .optional()
      .describe('Linux user for an isolated site.'),
    zero_downtime_deployments: z.boolean().optional(),
    shared_paths: z.array(sharedPath).optional().describe('Paths shared between releases with zero-downtime deployments.'),
    nginx_template_id: z.number().int().optional().describe('Nginx template to use.'),
    source_control_provider: z.enum(SOURCE_CONTROL_PROVIDERS).optional(),
    source_control_provider_id: z.number().int().optional().describe('Source control connection to deploy through.'),
    repository: z.string().min(1).optional().describe('Repository to install, e.g. "acme/app".'),
    branch: z.string().min(1).optional().describe('Branch to deploy.'),
    install_composer_dependencies: z.boolean().optional(),
    generate_deploy_key: z.boolean().optional().describe('Generate a deploy key for this repository only.'),
    push_to_deploy: z.boolean().optional().describe('Deploy automatically on every push to the branch.'),
    database_id: z.number().int().optional().describe('Existing database to use with the site.'),
    database_user_id: z.number().int().optional().describe('Existing database user to use with the site.'),
    frontend_package_manager: z.string().min(1).optional().describe('Package manager for frontend apps, e.g. "npm".'),
    frontend_build_command: z.string().min(1).optional().describe('Build command for frontend assets.'),
    nuxt_next_mode: z.string().min(1).optional().describe('Render mode for Next.js / Nuxt.js apps.'),
    nuxt_next_port: z.number().int().optional().describe('Port used by Next.js / Nuxt.js apps.'),
    statamic_setup: z.string().min(1).optional().describe('Statamic setup type.'),
    statamic_starter_kit: z.string().min(1).optional(),
    statamic_super_user_email: z.string().email().optional(),
    statamic_super_user_password: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    ...waitInput(300),
  },
  outputSchema: {
    ...operationOutput,
    site: siteOutput.nullable(),
  },
  async handler(args, { client, config, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const { organization: _org, server, wait, timeout_seconds, ...body } = args;
    const created = await client.post<SingleDocument | undefined>(apiPath`/orgs/${org}/servers/${server}/sites`, {
      body,
      signal,
    });
    const initial = created.data?.data ? flattenSingle(created.data) : undefined;
    const format = (flat: Record<string, unknown>) =>
      formatSite(flat, { detailed: false, allowSecrets: config.allowSecrets, serverId: String(server) });
    const action = `create the site "${args.name}"`;

    if (!initial) {
      return {
        structured: { status: 'queued' as const, check_with: 'forge_list_sites', site: null },
        summary: `Forge accepted the request to ${action}. Find it with forge_list_sites.`,
      };
    }
    if (!wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, site: format(initial) },
        summary: `Forge is creating site ${initial.id}. Follow it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readSite(client, org, initial.id, signal),
      phase: (site) => sitePhase(site.status),
      describe: (site) => `Site ${site.id} is ${site.status}`,
      timeoutSeconds: timeout_seconds,
      context: { sleep, progress },
    });
    const site = format(result.value ?? initial);
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: timeout_seconds,
      detail: result.status === 'completed' ? `Site ID ${site.id} on server ${site.server_id}; deploy it with forge_deploy_site.` : undefined,
    });
    return { structured: { ...done.structured, site }, summary: done.summary };
  },
});
