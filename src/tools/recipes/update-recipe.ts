import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { organizationInput } from '../shared/schemas.js';
import { formatRecipe, RECIPE_NOT_FOUND_HINT, recipeInput, recipeOutput, recipePath, recipeScriptInput, recipeUserInput } from './shared.js';

export const updateRecipe = defineTool({
  name: 'forge_update_recipe',
  title: 'Update recipe',
  description: 'Rename a recipe, change the user it runs as or replace its script.',
  toolset: 'recipes',
  operations: ['organizations.recipes.update'],
  permissions: ['recipe:manage'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: RECIPE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    recipe: recipeInput,
    name: z.string().min(1).optional().describe('New name.'),
    user: recipeUserInput.optional(),
    script: recipeScriptInput.optional().describe('New script (replaces the current one).'),
  },
  outputSchema: {
    recipe: recipeOutput,
  },
  async handler(args, { client, organization, signal }) {
    if (args.name === undefined && args.user === undefined && args.script === undefined) throw new ToolInputError('Pass `name`, `user` and/or `script`.');
    const response = await client.put<SingleDocument>(recipePath(organization(args.organization), args.recipe), {
      body: { name: args.name, user: args.user, script: args.script },
      signal,
    });
    const recipe = formatRecipe(flattenSingle(response.data), false);
    return { structured: { recipe }, summary: `Updated recipe ${recipe.name}.` };
  },
});
