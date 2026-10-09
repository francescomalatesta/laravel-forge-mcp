import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { ForgeApiError } from '../../forge/errors.js';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { relatedField, relatedId } from '../shared/relationships.js';
import { tail } from '../shared/schemas.js';

export { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';

/** Deployments complete when finished and fail when failed, failed in the build or cancelled. */
export function deploymentPhase(status: string | null): Phase {
  return phaseOf(status, { completed: ['finished'], failed: ['failed', 'failed-build', 'cancelled'] });
}

export const deploymentOutput = z.looseObject({
  id: z.string().describe('Deployment ID.'),
  status: z.string().nullable().describe('queued, pending, deploying, finished, failed, failed-build, cancelled.'),
  type: z.string().nullable(),
  commit_hash: z.string().nullable(),
  commit_message: z.string().nullable(),
  commit_author: z.string().nullable(),
  branch: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  created_at: z.string().nullable(),
  site_id: z.string().nullable(),
  site_name: z.string().nullable(),
  initiator_name: z.string().nullable(),
});

export type DeploymentOutput = z.output<typeof deploymentOutput>;

export function formatDeployment(flat: Record<string, unknown>): DeploymentOutput {
  const commit = (flat.commit ?? {}) as { hash?: string | null; message?: string | null; author?: string | null; branch?: string | null };
  return {
    id: String(flat.id),
    status: (flat.status as string | undefined) ?? null,
    type: (flat.type as string | undefined) ?? null,
    commit_hash: commit.hash ?? null,
    commit_message: commit.message ?? null,
    commit_author: commit.author ?? null,
    branch: commit.branch ?? null,
    started_at: (flat.started_at as string | undefined) ?? null,
    ended_at: (flat.ended_at as string | undefined) ?? null,
    created_at: (flat.created_at as string | undefined) ?? null,
    site_id: relatedId(flat, 'site'),
    site_name: (relatedField(flat, 'site', 'name') as string | null) ?? null,
    initiator_name: (relatedField(flat, 'initiator', 'name') as string | null) ?? null,
  };
}

export const logOutput = {
  log: z.string().nullable().describe('Deployment output (last `log_lines` lines), or null when unavailable.'),
  log_truncated: z.boolean(),
  log_total_lines: z.number().int().nullable(),
  log_unavailable_reason: z.string().nullable(),
};

export const logLinesInput = (fallback: number) =>
  z
    .number()
    .int()
    .min(0)
    .max(5000)
    .default(fallback)
    .describe('Return only the last N lines of the deployment log (0 = full log).');

/**
 * Fetches the deployment log. Reading logs needs the `site:manage-deploys`
 * permission: without it the rest of the result is still useful, so a 403
 * becomes a reason instead of an error.
 */
export async function fetchLog(
  client: ForgeClient,
  base: string,
  deployment: string | number,
  lines: number,
  signal: AbortSignal,
): Promise<z.output<z.ZodObject<typeof logOutput>>> {
  try {
    const response = await client.get<SingleDocument>(`${base}/deployments/${encodeURIComponent(String(deployment))}/log`, { signal });
    const output = tail(flattenSingle(response.data).output as string | null | undefined, lines);
    return { log: output.text, log_truncated: output.truncated, log_total_lines: output.total_lines, log_unavailable_reason: null };
  } catch (error) {
    if (error instanceof ForgeApiError && (error.status === 403 || error.status === 404)) {
      const reason =
        error.status === 403
          ? 'Reading deployment logs requires the site:manage-deploys permission.'
          : 'No log is available for this deployment yet.';
      return { log: null, log_truncated: false, log_total_lines: null, log_unavailable_reason: reason };
    }
    throw error;
  }
}
