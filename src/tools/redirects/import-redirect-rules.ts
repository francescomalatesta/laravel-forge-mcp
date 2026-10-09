import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { redirectRulesPath } from './shared.js';

const skippedRow = z.looseObject({
  line: z.string(),
  reason: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  type: z.string(),
});

interface ImportReport {
  imported?: number;
  invalid?: z.output<typeof skippedRow>[];
  duplicates?: z.output<typeof skippedRow>[];
}

export const importRedirectRules = defineTool({
  name: 'forge_import_redirect_rules',
  title: 'Import redirect rules',
  description:
    'Import redirect rules from CSV text with a from,to,type header (type: redirect or permanent). `append` adds them to the existing rules; `replace` DELETES every existing rule first. Invalid and duplicate rows are skipped and reported.',
  toolset: 'security',
  operations: ['organizations.servers.sites.redirect-rules.import'],
  permissions: ['site:manage-redirects'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    csv: z.string().min(1).describe('CSV content, e.g. "from,to,type\\n/old,/new,permanent".'),
    mode: z.enum(['append', 'replace']).describe('append: add to the existing rules; replace: remove every existing rule first.'),
  },
  outputSchema: {
    ...operationOutput,
    imported: z.number().int().describe('Rules imported.'),
    invalid: z.array(skippedRow).describe('Rows skipped because they are invalid.'),
    duplicates: z.array(skippedRow).describe('Rows skipped because they repeat a row or an existing rule.'),
  },
  async handler(args, { client, organization, signal }) {
    const header = args.csv.replace(/^\uFEFF/, '').trimStart().split('\n', 1)[0]!.trim().toLowerCase().replace(/\s/g, '');
    if (header !== 'from,to,type') throw new ToolInputError('The CSV must start with the header row "from,to,type".');

    const form = new FormData();
    form.append('file', new Blob([args.csv], { type: 'text/csv' }), 'redirects.csv');
    form.append('mode', args.mode);
    const response = await client.post<ImportReport | undefined>(`${redirectRulesPath(organization(args.organization), args.server, args.site)}/import`, {
      body: form,
      signal,
    });
    const report = { imported: response.data?.imported ?? 0, invalid: response.data?.invalid ?? [], duplicates: response.data?.duplicates ?? [] };
    const skipped = report.invalid.length + report.duplicates.length;
    // The import report is final; Nginx picks up the rules in the background.
    return {
      structured: { status: 'queued' as const, check_with: 'forge_list_redirect_rules', ...report },
      summary: `Imported ${report.imported} redirect rule(s)${args.mode === 'replace' ? ', replacing the existing ones' : ''}${
        skipped > 0 ? `; skipped ${report.invalid.length} invalid and ${report.duplicates.length} duplicate row(s)` : ''
      }. Forge installs them in the background: check them with forge_list_redirect_rules.`,
    };
  },
});
