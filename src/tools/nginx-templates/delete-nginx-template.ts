import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { NGINX_TEMPLATE_NOT_FOUND_HINT, nginxTemplateInput, nginxTemplatePath } from './shared.js';

export const deleteNginxTemplate = defineTool({
  name: 'forge_delete_nginx_template',
  title: 'Delete Nginx template',
  description: 'Delete an Nginx template. Sites created from it keep their configuration.',
  toolset: 'servers',
  operations: ['organizations.servers.nginx.templates.destroy'],
  permissions: ['server:manage-nginx-templates'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: NGINX_TEMPLATE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    template: nginxTemplateInput,
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(nginxTemplatePath(organization(args.organization), args.server, args.template), { signal });
    return { structured: { deleted: true }, summary: `Deleted Nginx template ${args.template}.` };
  },
});
