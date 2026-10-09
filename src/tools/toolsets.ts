/**
 * Toolsets group related tools so users can expose only what they need.
 * Fewer tools in context means better tool selection by the model.
 */
export const TOOLSETS = {
  core: 'Organizations, servers and other entry points needed by every workflow',
  sites: 'Sites, domains, certificates, Nginx and site configuration',
  deployments: 'Deployments, deployment scripts, logs and push-to-deploy',
  servers: 'Server management: PHP, services, network, events, logs',
  databases: 'Database schemas, users and backups',
  jobs: 'Scheduled jobs and background processes',
  security: 'Firewall rules, security rules, redirect rules and SSH keys',
  integrations: 'Laravel integrations: Horizon, Octane, Reverb, Pulse, Inertia, scheduler, maintenance',
  monitoring: 'Monitors, heartbeats and health checks',
  recipes: 'Recipes and recipe runs',
  teams: 'Teams, members, invitations, roles and permissions',
  providers: 'Cloud providers, regions, sizes, credentials and VPCs',
  storage: 'Storage providers',
  commands: 'Run arbitrary commands on sites (powerful: disabled by default)',
} as const;

export type ToolsetName = keyof typeof TOOLSETS;

export const TOOLSET_NAMES = Object.keys(TOOLSETS) as ToolsetName[];

export const DEFAULT_TOOLSETS: readonly ToolsetName[] = ['core', 'sites', 'deployments'];

export function isToolsetName(value: string): value is ToolsetName {
  return Object.hasOwn(TOOLSETS, value);
}
