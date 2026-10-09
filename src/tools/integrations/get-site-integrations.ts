import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { describeIntegration, INTEGRATION_NAMES, INTEGRATIONS_DESCRIPTION, integrationOperation, integrationOutput, integrationPath, readIntegration } from './shared.js';

export const getSiteIntegrations = defineTool({
  name: 'forge_get_site_integrations',
  title: 'Get site integrations',
  description: `Show which Laravel integrations are enabled on a site: ${INTEGRATIONS_DESCRIPTION} Pass \`integration\` to read only one.`,
  toolset: 'integrations',
  operations: INTEGRATION_NAMES.map((name) => integrationOperation(name, 'show')),
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    integration: z.enum(INTEGRATION_NAMES).optional().describe('Read only this integration (default: all of them).'),
  },
  outputSchema: {
    integrations: z.array(integrationOutput),
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const names = args.integration ? [args.integration] : INTEGRATION_NAMES;
    const integrations = await Promise.all(
      names.map((name) => readIntegration(client, integrationPath(org, args.server, args.site, name), name, signal)),
    );
    const enabled = integrations.filter((state) => state.enabled).map((state) => state.integration);
    return {
      structured: { integrations },
      summary: args.integration
        ? `${describeIntegration(integrations[0]!)}.`
        : enabled.length === 0
          ? 'No integrations are enabled on this site.'
          : `Enabled integrations: ${enabled.join(', ')}.`,
    };
  },
});
