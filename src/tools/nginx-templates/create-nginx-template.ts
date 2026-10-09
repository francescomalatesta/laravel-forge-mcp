import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatNginxTemplate, nginxTemplateContentInput, nginxTemplateOutput, nginxTemplatesPath } from './shared.js';

export const createNginxTemplate = defineTool({
  name: 'forge_create_nginx_template',
  title: 'Create Nginx template',
  description: 'Save a custom Nginx template on a server, to use when creating sites (`nginx_template_id` in forge_create_site).',
  toolset: 'servers',
  operations: ['organizations.servers.nginx.templates.store'],
  permissions: ['server:manage-nginx-templates'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).describe('Template name.'),
    content: nginxTemplateContentInput,
  },
  outputSchema: {
    template: nginxTemplateOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument>(nginxTemplatesPath(organization(args.organization), args.server), {
      body: { name: args.name, content: args.content },
      signal,
    });
    const template = formatNginxTemplate(flattenSingle(response.data), false);
    return { structured: { template }, summary: `Created Nginx template ${template.name} (ID ${template.id}).` };
  },
});
