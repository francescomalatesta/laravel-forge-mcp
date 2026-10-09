import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, responseFormatInput } from '../shared/schemas.js';
import { formatRecipe, recipeInput, recipeOutput, recipePath, recipesPath } from './shared.js';

export const listRecipes = defineTool({
  name: 'forge_list_recipes',
  title: 'List recipes',
  description:
    "List the organization's recipes (reusable Bash scripts run on servers), or the ready-made recipes Forge provides with `source: \"forge\"`. Pass `recipe` to read one with its script. Run one with forge_run_recipe.",
  toolset: 'recipes',
  operations: ['organizations.recipes.index', 'organizations.recipes.show', 'forge-recipes.index', 'forge-recipes.show'],
  permissions: ['recipe:view'],
  readOnly: true,
  notFoundHint: 'Check the recipe ID with forge_list_recipes (and the `source`).',
  inputSchema: {
    organization: organizationInput,
    source: z.enum(['organization', 'forge']).default('organization').describe('organization: your recipes; forge: recipes provided by Forge.'),
    recipe: recipeInput.optional().describe('Return only this recipe, with its script.'),
    response_format: responseFormatInput.describe('"detailed" also returns every script.'),
    ...paginationInput,
  },
  outputSchema: {
    recipes: z.array(recipeOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const forge = args.source === 'forge';
    const base = forge ? '/forge-recipes' : recipesPath(organization(args.organization));
    if (args.recipe !== undefined) {
      const path = forge ? apiPath`/forge-recipes/${args.recipe}` : recipePath(organization(args.organization), args.recipe);
      const recipe = formatRecipe(await readResource(client, path, signal), true);
      return { structured: { recipes: [recipe], next_cursor: null, has_more: false }, summary: `Recipe ${recipe.name} runs as ${recipe.user}.` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const recipes = page.items.map((item) => formatRecipe(item, args.response_format === 'detailed'));
    return {
      structured: { recipes, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        recipes.length === 0
          ? 'No recipes found.'
          : `Found ${recipes.length} recipe(s): ${recipes.map((r) => `${r.name} (${r.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
