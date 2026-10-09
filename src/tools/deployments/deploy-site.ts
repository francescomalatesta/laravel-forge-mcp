import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, waitFor, waitInput } from '../shared/async.js';
import {
  deploymentOutput,
  deploymentPhase,
  fetchLog,
  formatDeployment,
  logLinesInput,
  logOutput,
  SITE_NOT_FOUND_HINT,
  siteScopeInput,
  sitePath,
} from './shared.js';

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
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    ...waitInput(180),
    log_lines: logLinesInput(50),
  },
  outputSchema: {
    ...operationOutput,
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
        structured: { status: 'queued' as const, check_with: 'forge_list_deployments', deployment: null, finished: false, succeeded: false, ...noLog },
        summary: 'Forge accepted the deployment request. Follow it with forge_list_deployments.',
      };
    }
    const queuedDeployment = formatDeployment(flattenSingle(created.data));

    if (!args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: 'forge_get_deployment', deployment: queuedDeployment, finished: false, succeeded: false, ...noLog },
        summary: `Deployment ${queuedDeployment.id} was queued. Follow it with forge_get_deployment (deployment ${queuedDeployment.id}).`,
      };
    }

    const result = await waitFor({
      initial: queuedDeployment,
      poll: async () => {
        const response = await client.get<SingleDocument>(`${base}/deployments/${encodeURIComponent(queuedDeployment.id)}`, { signal });
        return formatDeployment(flattenSingle(response.data));
      },
      phase: (deployment) => deploymentPhase(deployment.status),
      describe: (deployment) => `Deployment ${deployment.id} is ${deployment.status ?? 'pending'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });

    const deployment = result.value ?? queuedDeployment;
    const finished = result.status === 'completed' || result.status === 'failed';
    const log = finished ? await fetchLog(client, base, deployment.id, args.log_lines, signal) : noLog;

    const summaries = {
      completed: `Deployment ${deployment.id} finished successfully.`,
      failed: `Deployment ${deployment.id} ended with status "${deployment.status}". The end of the log is included; see forge_get_deployment for more lines.`,
      in_progress: `Deployment ${deployment.id} is still ${deployment.status} after ${args.timeout_seconds}s. Check it again with forge_get_deployment.`,
      queued: `Deployment ${deployment.id} was queued, but the tool ${result.unfollowed}. Follow it with forge_get_deployment.`,
    };

    return {
      structured: {
        status: result.status,
        check_with: 'forge_get_deployment',
        deployment,
        finished,
        succeeded: result.status === 'completed',
        ...log,
      },
      summary: summaries[result.status],
    };
  },
});
