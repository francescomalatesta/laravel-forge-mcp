import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { formatNginxTemplate, NGINX_TEMPLATE_NOT_FOUND_HINT, nginxTemplateContentInput, nginxTemplateInput, nginxTemplateOutput, nginxTemplatePath } from './shared.js';

export const updateNginxTemplate = defineTool({
  name: 'forge_update_nginx_template',
  title: 'Update Nginx template',
  description: 'Rename an Nginx template or replace its content. Existing sites are not changed: the template is used for new sites only.',
  toolset: 'servers',
  operations: ['organizations.servers.nginx.templates.update', 'organizations.servers.nginx.templates.show'],
  permissions: ['server:manage-nginx-templates', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: NGINX_TEMPLATE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    template: nginxTemplateInput,
    name: z.string().min(1).optional().describe('New name.'),
    content: nginxTemplateContentInput.optional().describe('New content (replaces the whole template).'),
  },
  outputSchema: {
    template: nginxTemplateOutput,
  },
  async handler(args, { client, organization, signal }) {
    if (args.name === undefined && args.content === undefined) throw new ToolInputError('Pass `name` and/or `content`.');
    const path = nginxTemplatePath(organization(args.organization), args.server, args.template);
    // Both fields are required by the API: keep the current value of the one not changed.
    const current = args.name === undefined || args.content === undefined ? await readResource(client, path, signal) : undefined;
    const response = await client.put<SingleDocument>(path, {
      body: { name: args.name ?? current?.name, content: args.content ?? current?.content },
      signal,
    });
    const template = formatNginxTemplate(flattenSingle(response.data), false);
    return { structured: { template }, summary: `Updated Nginx template ${template.name}.` };
  },
});
