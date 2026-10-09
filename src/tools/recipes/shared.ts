import { z } from 'zod';
import { apiPath } from '../../forge/path.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';

export function recipesPath(org: string): string {
  return apiPath`/orgs/${org}/recipes`;
}

export function recipePath(org: string, recipe: string | number): string {
  return `${recipesPath(org)}/${encodeURIComponent(String(recipe))}`;
}

export const recipeInput = idInput('Recipe ID. Use forge_list_recipes to find it.');

export const RECIPE_NOT_FOUND_HINT = 'Check the recipe ID with forge_list_recipes.';

export const recipeUserInput = z.enum(['root', 'forge']).describe('User the script runs as.');
export const recipeScriptInput = z.string().min(1).describe('Bash script run on each server.');

export const recipeOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  user: z.string().nullable(),
  info: z.string().nullable().optional().describe('Forge recipes only: what the recipe does.'),
  script: z.string().nullable().optional().describe('Only when reading one recipe or with response_format "detailed".'),
  created_at: z.string().nullable(),
});

export type RecipeOutput = z.output<typeof recipeOutput>;

export function formatRecipe(flat: Record<string, unknown>, withScript: boolean): RecipeOutput {
  const recipe = pick(flat, ['id', 'name', 'user', 'created_at']) as RecipeOutput;
  if (flat.info !== undefined) recipe.info = (flat.info as string | null) ?? null;
  if (withScript) recipe.script = (flat.script as string | null | undefined) ?? null;
  return recipe;
}

export const recipeRunOutput = z.looseObject({
  id: z.string(),
  server_id: z.number().nullable(),
  status: z.string().nullable().describe('waiting, running, finished or failed.'),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  executed_by: z.number().nullable(),
});

export type RecipeRunOutput = z.output<typeof recipeRunOutput>;

export function formatRecipeRun(flat: Record<string, unknown>): RecipeRunOutput {
  return pick(flat, ['id', 'server_id', 'status', 'started_at', 'finished_at', 'executed_by']) as RecipeRunOutput;
}

export function recipeRunPhase(status: unknown): Phase {
  return phaseOf(status, { completed: ['finished'], failed: ['failed'] });
}
