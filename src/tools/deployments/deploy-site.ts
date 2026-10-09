import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import {
  FINAL_STATUSES,
  deploymentOutput,
  fetchLog,
  formatDeployment,
  logLinesInput,
  logOutput,
  SITE_NOT_FOUND_HINT,
  siteScopeInput,
  sitePath,
} from './shared.js';

export const POLL_INTERVAL_MS = 5_000;

export const deploySite = defineTool({
  name: 'forge_deploy_site',
  title: 'Deploy site',
  description:
    "Deploy a site now by running its deployment script. By default waits for the deployment to finish (up to `timeout_seconds`) and returns its final status with the end of the log; with `wait: false` returns as soon as Forge queues it. Check the deployment script first with forge_get_deployment_script if unsure what it runs.",
  toolset: 'deployments',
  operations: [
    'organizations.servers.sites.deployments.store',
    'organizations.servers.sites.deployments.show',
    'organizations.servers.sites.deployments.log.show',
  ],
  permissions: ['site:manage-deploys', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    wait: z.boolean().default(true).describe('Wait for the deployment to finish before returning.'),
    timeout_seconds: z
      .number()
      .int()
      .min(10)
      .max(900)
      .default(180)
      .describe('Maximum time to wait when `wait` is true.'),
    log_lines: logLinesInput(50),
  },
  outputSchema: {
    deployment: deploymentOutput.nullable(),
    finished: z.boolean().describe('Whether the deployment reached a final status (finished, failed, cancelled).'),
    succeeded: z.boolean(),
    ...logOutput,
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = sitePath(organization(args.organization), args.server, args.site);
    const created = await client.post<SingleDocument | undefined>(`${base}/deployments`, { signal });
    const noLog = { log: null, log_truncated: false, log_total_lines: null, log_unavailable_reason: null };
    if (!created.data?.data) {
      // Accepted without a deployment in the body: nothing to follow by ID.
      return {
        structured: { deployment: null, finished: false, succeeded: false, ...noLog },
        summary: 'Forge accepted the deployment request. Follow it with forge_list_deployments.',
      };
    }
    let deployment = formatDeployment(flattenSingle(created.data));

    if (!args.wait) {
      return {
        structured: { deployment, finished: false, succeeded: false, ...noLog },
        summary: `Deployment ${deployment.id} was queued. Follow it with forge_get_deployment (deployment ${deployment.id}).`,
      };
    }

    const maxPolls = Math.ceil((args.timeout_seconds * 1000) / POLL_INTERVAL_MS);
    for (let poll = 1; poll <= maxPolls && !FINAL_STATUSES.has(deployment.status ?? ''); poll++) {
      await progress(poll, maxPolls, `Deployment ${deployment.id} is ${deployment.status ?? 'pending'}`);
      await sleep(POLL_INTERVAL_MS);
      const response = await client.get<SingleDocument>(`${base}/deployments/${encodeURIComponent(deployment.id)}`, { signal });
      deployment = formatDeployment(flattenSingle(response.data));
    }

    const finished = FINAL_STATUSES.has(deployment.status ?? '');
    const succeeded = deployment.status === 'finished';
    const log = finished ? await fetchLog(client, base, deployment.id, args.log_lines, signal) : noLog;

    let summary: string;
    if (!finished) {
      summary = `Deployment ${deployment.id} is still ${deployment.status} after ${args.timeout_seconds}s. Check it again with forge_get_deployment.`;
    } else if (succeeded) {
      summary = `Deployment ${deployment.id} finished successfully.`;
    } else {
      summary = `Deployment ${deployment.id} ended with status "${deployment.status}". The end of the log is included; see forge_get_deployment for more lines.`;
    }

    return { structured: { deployment, finished, succeeded, ...log }, summary };
  },
});
