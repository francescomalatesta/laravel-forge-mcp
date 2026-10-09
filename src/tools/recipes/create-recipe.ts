import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { formatRecipe, recipeOutput, recipeScriptInput, recipesPath, recipeUserInput } from './shared.js';

export const createRecipe = defineTool({
  name: 'forge_create_recipe',
  title: 'Create recipe',
  description: 'Save a Bash script as a recipe, to run it on one or more servers with forge_run_recipe.',
  toolset: 'recipes',
  operations: ['organization.recipes.store'],
  permissions: ['recipe:manage'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  inputSchema: {
    organization: organizationInput,
    name: z.string().min(1).describe('Recipe name.'),
    user: recipeUserInput.default('forge'),
    script: recipeScriptInput,
    team: idInput('Team that owns the recipe.').optional(),
  },
  outputSchema: {
    recipe: recipeOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument>(recipesPath(organization(args.organization)), {
      body: { name: args.name, user: args.user, script: args.script, team_id: args.team === undefined ? undefined : Number(args.team) },
      signal,
    });
    const recipe = formatRecipe(flattenSingle(response.data), false);
    return { structured: { recipe }, summary: `Created recipe ${recipe.name} (ID ${recipe.id}). Run it with forge_run_recipe.` };
  },
});
