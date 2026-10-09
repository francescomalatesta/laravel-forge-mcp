import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, responseFormatInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatNginxTemplate, nginxTemplateInput, nginxTemplateOutput, nginxTemplatePath, nginxTemplatesPath } from './shared.js';

const SORT = ['name', '-name', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listNginxTemplates = defineTool({
  name: 'forge_list_nginx_templates',
  title: 'List Nginx templates',
  description:
    'List the Nginx templates of a server (custom server blocks used when creating sites, see `nginx_template_id` in forge_create_site), or read one with its content using `template`.',
  toolset: 'servers',
  operations: ['organizations.servers.nginx.templates.index', 'organizations.servers.nginx.templates.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    template: nginxTemplateInput.optional().describe('Return only this template, with its content.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    response_format: responseFormatInput.describe('"detailed" also returns the content of every template.'),
    ...paginationInput,
  },
  outputSchema: {
    templates: z.array(nginxTemplateOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    if (args.template !== undefined) {
      const template = formatNginxTemplate(await readResource(client, nginxTemplatePath(org, args.server, args.template), signal), true);
      return { structured: { templates: [template], next_cursor: null, has_more: false }, summary: `Nginx template ${template.name}.` };
    }
    const response = await client.get<CollectionDocument>(nginxTemplatesPath(org, args.server), {
      query: { filter: { name: args.name }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const templates = page.items.map((item) => formatNginxTemplate(item, args.response_format === 'detailed'));
    return {
      structured: { templates, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        templates.length === 0
          ? 'No Nginx templates found.'
          : `Found ${templates.length} Nginx template(s): ${templates.map((t) => `${t.name} (${t.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
