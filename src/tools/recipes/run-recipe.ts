import { z } from 'zod';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { listRecent } from '../shared/read.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { formatRecipeRun, recipePath, recipeRunOutput, recipeRunPhase } from './shared.js';

export const runRecipe = defineTool({
  name: 'forge_run_recipe',
  title: 'Run recipe',
  description:
    'Run a recipe on one or more servers: one of yours (`recipe`) or one provided by Forge (`forge_recipe`). It runs the script with root or forge privileges: confirm with the user first. Waits for your recipes to finish on every server unless `wait` is false.',
  toolset: 'recipes',
  operations: ['organizations.recipes.runs.store', 'forge-recipes.runs.store', 'organizations.recipes.runs.index'],
  permissions: ['recipe:manage', 'recipe:view'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: 'Check the recipe ID with forge_list_recipes and the server IDs with forge_list_servers.',
  inputSchema: {
    organization: organizationInput,
    recipe: idInput('Your recipe to run. Use forge_list_recipes.').optional(),
    forge_recipe: idInput('Forge-provided recipe to run. Use forge_list_recipes with source "forge".').optional(),
    servers: z.array(z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])).min(1).describe('Server IDs to run it on.'),
    email: z.boolean().optional().describe('Email a notification when the recipe has completed.'),
    ...waitInput(300),
  },
  outputSchema: {
    ...operationOutput,
    runs: z.array(recipeRunOutput).nullable().describe('One run per server once they show up.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    if ((args.recipe === undefined) === (args.forge_recipe === undefined)) throw new ToolInputError('Pass either `recipe` or `forge_recipe`.');
    const servers = args.servers.map(Number);
    const body = { servers, email: args.email };
    const action = `run the recipe on ${servers.length} server(s)`;

    if (args.forge_recipe !== undefined) {
      await client.post(apiPath`/forge-recipes/${args.forge_recipe}/runs`, { body, signal });
      // Forge recipes have no runs endpoint: the result shows up in the server events.
      const accepted = queued(action, 'forge_list_server_events');
      return { ...accepted, structured: { ...accepted.structured, runs: null } };
    }

    const runsPath = `${recipePath(organization(args.organization), args.recipe!)}/runs`;
    // Forge returns no body: remember the earlier runs to spot one new run per server.
    const earlier = args.wait ? new Set((await listRecent(client, runsPath, signal, { sortable: false })).map((run) => run.id)) : undefined;
    await client.post(runsPath, { body, signal });
    if (!earlier) {
      const accepted = queued(action, 'forge_list_recipe_runs');
      return { ...accepted, structured: { ...accepted.structured, runs: null } };
    }

    const result = await waitFor({
      poll: async () => (await listRecent(client, runsPath, signal, { sortable: false })).filter((run) => !earlier.has(run.id)).map(formatRecipeRun),
      phase: (runs) => {
        if (servers.some((server) => !runs.some((run) => run.server_id === server))) return 'pending';
        const phases = runs.map((run) => recipeRunPhase(run.status));
        if (phases.includes('pending')) return 'pending';
        return phases.includes('failed') ? 'failed' : 'completed';
      },
      describe: (runs) => `${runs.filter((run) => recipeRunPhase(run.status) !== 'pending').length}/${servers.length} server(s) done`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const failed = (result.value ?? []).filter((run) => run.status === 'failed');
    const done = outcome(result, {
      action,
      checkWith: 'forge_list_recipe_runs',
      timeoutSeconds: args.timeout_seconds,
      detail: failed.length > 0 ? `Failed on server(s) ${failed.map((run) => run.server_id).join(', ')}: read the output with forge_list_recipe_runs.` : undefined,
    });
    return { structured: { ...done.structured, runs: result.value ?? null }, summary: done.summary };
  },
});
