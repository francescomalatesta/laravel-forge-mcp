import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { organizationInput } from '../shared/schemas.js';
import { RECIPE_NOT_FOUND_HINT, recipeInput, recipePath } from './shared.js';

export const deleteRecipe = defineTool({
  name: 'forge_delete_recipe',
  title: 'Delete recipe',
  description: 'Delete a recipe and its run history.',
  toolset: 'recipes',
  operations: ['organizations.recipes.destroy'],
  permissions: ['recipe:manage'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: RECIPE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    recipe: recipeInput,
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(recipePath(organization(args.organization), args.recipe), { signal });
    return { structured: { deleted: true }, summary: `Deleted recipe ${args.recipe}.` };
  },
});
