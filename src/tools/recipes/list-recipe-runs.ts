import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { outputFields, outputLinesInput } from '../shared/output.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary, tail } from '../shared/schemas.js';
import { formatRecipeRun, RECIPE_NOT_FOUND_HINT, recipeInput, recipePath, recipeRunOutput } from './shared.js';

export const listRecipeRuns = defineTool({
  name: 'forge_list_recipe_runs',
  title: 'List recipe runs',
  description: 'List the runs of a recipe (one per server) with their status, or read one with its output using `run`.',
  toolset: 'recipes',
  operations: ['organizations.recipes.runs.index', 'organizations.recipes.runs.show'],
  permissions: ['recipe:view'],
  readOnly: true,
  notFoundHint: RECIPE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    recipe: recipeInput,
    run: idInput('Recipe run ID.').optional().describe('Return only this run, with its output.'),
    output_lines: outputLinesInput(100),
    ...paginationInput,
  },
  outputSchema: {
    runs: z.array(recipeRunOutput),
    ...outputFields,
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = `${recipePath(organization(args.organization), args.recipe)}/runs`;
    if (args.run !== undefined) {
      const flat = await readResource(client, `${base}/${encodeURIComponent(String(args.run))}`, signal);
      const run = formatRecipeRun(flat);
      const output = tail(flat.output as string | null | undefined, args.output_lines);
      return {
        structured: {
          runs: [run],
          output: flat.output === null || flat.output === undefined ? null : output.text,
          output_truncated: output.truncated,
          output_total_lines: output.total_lines,
          next_cursor: null,
          has_more: false,
        },
        summary: `Run ${run.id} on server ${run.server_id} is ${run.status}.`,
      };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const runs = page.items.map(formatRecipeRun);
    return {
      structured: { runs, output: null, output_truncated: false, output_total_lines: null, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: runs.length === 0 ? 'This recipe has not run yet.' : `Found ${runs.length} run(s).${paginationSummary(page.nextCursor)}`,
    };
  },
});
