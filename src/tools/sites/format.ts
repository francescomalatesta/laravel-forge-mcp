import { z } from 'zod';
import { relatedField, relatedId } from '../shared/relationships.js';
import { redact } from '../shared/secrets.js';

/** Site fields holding secrets: the deployment trigger URL deploys the site when called. */
const SECRET_FIELDS = ['deployment_url'] as const;

const latestDeploymentOutput = z
  .looseObject({
    id: z.string(),
    status: z.string().nullable(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    commit_message: z.string().nullable(),
  })
  .nullable();

export const siteOutput = z.looseObject({
  id: z.string().describe('Site ID, used as the `site` argument of other tools.'),
  name: z.string().nullable().describe('Primary domain of the site.'),
  url: z.string().nullable(),
  status: z.string().nullable().describe('installed, creating, deploying, failed, maintenance, ...'),
  deployment_status: z.string().nullable(),
  app_type: z.string().nullable(),
  php_version: z.string().nullable(),
  https: z.boolean().nullable(),
  repository_url: z.string().nullable(),
  repository_branch: z.string().nullable(),
  quick_deploy: z.boolean().nullable().describe('Whether push-to-deploy is enabled.'),
  server_id: z.string().nullable().describe('ID of the server hosting the site, used as the `server` argument.'),
  server_name: z.string().nullable(),
  latest_deployment: latestDeploymentOutput,
});

export type SiteOutput = z.output<typeof siteOutput>;

interface FormatOptions {
  detailed: boolean;
  allowSecrets: boolean;
  /** Known server ID when the site was listed through a server. */
  serverId?: string;
}

export function formatSite(flat: Record<string, unknown>, { detailed, allowSecrets, serverId }: FormatOptions): SiteOutput {
  const repository = (flat.repository ?? {}) as { url?: string | null; branch?: string | null };
  const concise = {
    id: String(flat.id),
    name: (flat.name as string | undefined) ?? null,
    url: (flat.url as string | undefined) ?? null,
    status: (flat.status as string | undefined) ?? null,
    deployment_status: (flat.deployment_status as string | undefined) ?? null,
    app_type: (flat.app_type as string | undefined) ?? null,
    php_version: (flat.php_version as string | undefined) ?? null,
    https: (flat.https as boolean | undefined) ?? null,
    repository_url: repository.url ?? null,
    repository_branch: repository.branch ?? null,
    quick_deploy: (flat.quick_deploy as boolean | undefined) ?? null,
    server_id: relatedId(flat, 'server') ?? serverId ?? null,
    server_name: (relatedField(flat, 'server', 'name') as string | null) ?? null,
    latest_deployment: formatLatestDeployment(flat.latestDeployment),
  };
  if (!detailed) return concise;

  const { server: _server, latestDeployment: _latest, ...rest } = redact(flat, SECRET_FIELDS, allowSecrets);
  return { ...rest, ...concise };
}

function formatLatestDeployment(value: unknown): z.output<typeof latestDeploymentOutput> {
  if (!value || typeof value !== 'object') return null;
  const deployment = value as Record<string, unknown> & { commit?: { message?: string | null } };
  // An unresolved identifier ({ type, id }) carries no status: still useful as an ID.
  return {
    id: String(deployment.id),
    status: (deployment.status as string | undefined) ?? null,
    started_at: (deployment.started_at as string | undefined) ?? null,
    ended_at: (deployment.ended_at as string | undefined) ?? null,
    commit_message: deployment.commit?.message ?? null,
  };
}
