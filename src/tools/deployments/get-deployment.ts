import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { idInput } from '../shared/schemas.js';
import { deploymentOutput, fetchLog, formatDeployment, logLinesInput, logOutput, siteScopeInput, sitePath } from './shared.js';

export const getDeployment = defineTool({
  name: 'forge_get_deployment',
  title: 'Get deployment',
  description:
    'Get a deployment with its status, commit, timing and the end of its log. Use it to understand why a deployment failed.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.show', 'organizations.servers.sites.deployments.log.show'],
  permissions: ['server:view', 'site:manage-deploys'],
  readOnly: true,
  notFoundHint: 'Check the deployment ID with forge_list_deployments.',
  inputSchema: {
    ...siteScopeInput,
    deployment: idInput('Deployment ID. Use forge_list_deployments to find it.'),
    include_log: z.boolean().default(true).describe('Also fetch the deployment log.'),
    log_lines: logLinesInput(100),
  },
  outputSchema: {
    deployment: deploymentOutput,
    ...logOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = sitePath(organization(args.organization), args.server, args.site);
    const [response, log] = await Promise.all([
      client.get<SingleDocument>(`${base}/deployments/${encodeURIComponent(String(args.deployment))}`, { signal }),
      args.include_log
        ? fetchLog(client, base, args.deployment, args.log_lines, signal)
        : Promise.resolve({ log: null, log_truncated: false, log_total_lines: null, log_unavailable_reason: null }),
    ]);
    const deployment = formatDeployment(flattenSingle(response.data));

    return {
      structured: { deployment, ...log },
      summary: `Deployment ${deployment.id} is ${deployment.status}${
        deployment.commit_message ? ` (commit: "${deployment.commit_message}")` : ''
      }.${log.log_unavailable_reason ? ` ${log.log_unavailable_reason}` : ''}`,
    };
  },
});
