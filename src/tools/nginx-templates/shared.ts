import { z } from 'zod';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';

export function nginxTemplatesPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/nginx/templates`;
}

export function nginxTemplatePath(org: string, server: string | number, template: string | number): string {
  return `${nginxTemplatesPath(org, server)}/${encodeURIComponent(String(template))}`;
}

export const nginxTemplateInput = idInput('Nginx template ID. Use forge_list_nginx_templates to find it.');

export const NGINX_TEMPLATE_NOT_FOUND_HINT = 'Check the template ID with forge_list_nginx_templates.';

export const nginxTemplateContentInput = z
  .string()
  .min(1)
  .describe('Nginx server block; Forge replaces variables such as {{DOMAINS}}, {{PATH}}, {{PORT}} and {{PROXY_PASS}} when it creates a site.');

export const nginxTemplateOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  content: z.string().nullable().optional().describe('Template content (only when reading one template or with response_format "detailed").'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type NginxTemplateOutput = z.output<typeof nginxTemplateOutput>;

export function formatNginxTemplate(flat: Record<string, unknown>, withContent: boolean): NginxTemplateOutput {
  return pick(flat, withContent ? (['id', 'name', 'content', 'created_at', 'updated_at'] as const) : (['id', 'name', 'created_at', 'updated_at'] as const)) as NginxTemplateOutput;
}
