import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { relatedId } from '../shared/relationships.js';
import { readResource } from '../shared/read.js';
import { sitePath } from '../shared/site-scope.js';

/** Integration name → API path segment and fields of its resource. */
export const INTEGRATIONS = {
  horizon: { segment: 'horizon', installed: 'horizon_installed', settings: [] },
  octane: { segment: 'octane', installed: 'octane_installed', settings: ['port'] },
  reverb: { segment: 'reverb', installed: 'reverb_installed', settings: ['host', 'port', 'connections'] },
  pulse: { segment: 'pulse', installed: 'pulse_installed', settings: [] },
  inertia: { segment: 'inertia', installed: 'inertia_installed', settings: [] },
  scheduler: { segment: 'laravel-scheduler', installed: 'laravel_installed', settings: [] },
  maintenance: { segment: 'laravel-maintenance', installed: 'laravel_installed', settings: [] },
} as const;

export type IntegrationName = keyof typeof INTEGRATIONS;
export const INTEGRATION_NAMES = Object.keys(INTEGRATIONS) as [IntegrationName, ...IntegrationName[]];

export const INTEGRATIONS_DESCRIPTION =
  'horizon (queue dashboard and workers), octane (application server), reverb (WebSocket server), pulse (monitoring), inertia (SSR server), scheduler (runs `schedule:run` every minute), maintenance (Laravel maintenance mode).';

/** OperationId of an integration endpoint, e.g. "organizations.servers.sites.integrations.horizon.store". */
export function integrationOperation(integration: IntegrationName, verb: 'show' | 'store' | 'destroy'): string {
  return `organizations.servers.sites.integrations.${INTEGRATIONS[integration].segment}.${verb}`;
}

export function integrationPath(org: string, server: string | number, site: string | number, integration: IntegrationName): string {
  return `${sitePath(org, server, site)}/integrations/${INTEGRATIONS[integration].segment}`;
}

export const integrationOutput = z.looseObject({
  integration: z.enum(INTEGRATION_NAMES),
  enabled: z.boolean().nullable().describe('Whether the integration is enabled on the site.'),
  status: z.string().nullable().describe('Transition in progress (maintenance: enabling or disabling), or the raw state when Forge reports one.'),
  package_installed: z.boolean().nullable().describe('Whether the Laravel package (or Laravel itself) is installed in the site.'),
  settings: z.record(z.string(), z.unknown()).describe('Port, host, connections (Octane and Reverb).'),
  background_process_id: z.string().nullable().describe('Daemon running the integration (Horizon, Octane, Reverb, Pulse, Inertia).'),
  scheduled_job_id: z.string().nullable().describe('Scheduled job running the scheduler.'),
});

export type IntegrationOutput = z.output<typeof integrationOutput>;

const TRUE = new Set(['true', '1', 'yes', 'enabled', 'on', 'active', 'installed']);
const FALSE = new Set(['false', '0', 'no', 'disabled', 'off', 'inactive', '']);

/** Some integrations report `enabled` as a string: normalize it, keeping unknown values as the status. */
export function formatIntegration(integration: IntegrationName, flat: Record<string, unknown>): IntegrationOutput {
  const raw = flat.enabled;
  let enabled: boolean | null = null;
  let status = typeof flat.status === 'string' ? flat.status : null;
  if (typeof raw === 'boolean') enabled = raw;
  else if (typeof raw === 'number') enabled = raw !== 0;
  else if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (TRUE.has(value)) enabled = true;
    else if (FALSE.has(value)) enabled = false;
    else status ??= raw;
  }
  const { installed, settings } = INTEGRATIONS[integration];
  return {
    integration,
    enabled,
    status,
    package_installed: typeof flat[installed] === 'boolean' ? (flat[installed] as boolean) : null,
    settings: Object.fromEntries(settings.map((key) => [key, flat[key] ?? null])),
    background_process_id: relatedId(flat, 'backgroundProcess'),
    scheduled_job_id: relatedId(flat, 'job'),
  };
}

export async function readIntegration(client: ForgeClient, path: string, integration: IntegrationName, signal: AbortSignal) {
  return formatIntegration(integration, await readResource(client, path, signal));
}

export function describeIntegration(state: IntegrationOutput): string {
  return `${state.integration} is ${state.status ?? (state.enabled === null ? 'in an unknown state' : state.enabled ? 'enabled' : 'disabled')}`;
}
