import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const RECIPES = '/api/orgs/acme/recipes';
const env = { FORGE_TOOLSETS: 'core,recipes' };
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const recipe = (attributes: Record<string, unknown> = {}) =>
  specSchema('RecipeResource', { id: '4', attributes: { name: 'Install htop', user: 'root', script: 'apt-get install -y htop', ...attributes } });
const run = (id: string, server: number, status: string) =>
  specSchema('RecipeLogResource', { id, attributes: { server_id: server, recipe_id: 4, status, output: 'done' } });
const runList = (...items: ReturnType<typeof run>[]) => ({ body: specResponse('organizations.recipes.runs.index', 200, { data: items }) });

describe('recipes', () => {
  it('forge_list_recipes lists recipes without scripts, or Forge recipes', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.recipes.index', 200, { data: [recipe()] }) },
        { body: specResponse('forge-recipes.index', 200, { data: [specSchema('ForgeRecipeResource', { id: '1', attributes: { name: 'Swap' } })] }) },
      ],
    });
    const result = await harness.call('forge_list_recipes', {});
    expect((result.structuredContent as { recipes: Record<string, unknown>[] }).recipes[0]).not.toHaveProperty('script');
    await harness.call('forge_list_recipes', { source: 'forge' });
    expect(paths()).toEqual([`GET ${RECIPES}`, 'GET /api/forge-recipes']);
  });

  it('forge_list_recipes reads one recipe with its script', async () => {
    harness = await createHarness({ env, responses: [{ body: specResponse('organizations.recipes.show', 200, { data: recipe() }) }] });
    const result = await harness.call('forge_list_recipes', { recipe: 4 });
    expect(result.structuredContent).toMatchObject({ recipes: [{ id: '4', script: 'apt-get install -y htop' }] });
  });

  it('forge_create_recipe, forge_update_recipe and forge_delete_recipe', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organization.recipes.store', 200, { data: recipe() }) },
        { body: specResponse('organizations.recipes.update', 200, { data: recipe({ name: 'htop' }) }) },
        { status: 204 },
      ],
    });
    await harness.call('forge_create_recipe', { name: 'Install htop', user: 'root', script: 'apt-get install -y htop' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { name: 'Install htop', user: 'root', script: 'apt-get install -y htop' } });
    await harness.call('forge_update_recipe', { recipe: 4, name: 'htop' });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { name: 'htop' } });
    await harness.call('forge_delete_recipe', { recipe: 4 });
    expect(paths()).toEqual([`POST ${RECIPES}`, `PUT ${RECIPES}/4`, `DELETE ${RECIPES}/4`]);
  });

  it('forge_run_recipe waits for one run per server', async () => {
    harness = await createHarness({
      env,
      responses: [
        runList(run('1', 3, 'finished')),
        { status: 202 },
        runList(run('2', 3, 'running'), run('1', 3, 'finished')),
        runList(run('2', 3, 'finished'), run('3', 5, 'finished'), run('1', 3, 'finished')),
      ],
    });
    const result = await harness.call('forge_run_recipe', { recipe: 4, servers: [3, 5] });
    expect(harness.requests[0]?.url.searchParams.has('sort')).toBe(false);
    expect(harness.requests[1]).toMatchObject({ method: 'POST', body: { servers: [3, 5] } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', runs: [{ id: '2' }, { id: '3' }] });
  });

  it('forge_run_recipe reports the servers where it failed', async () => {
    harness = await createHarness({ env, responses: [runList(), { status: 202 }, runList(run('2', 3, 'failed'))] });
    const result = await harness.call('forge_run_recipe', { recipe: 4, servers: [3] });
    expect(result.structuredContent).toMatchObject({ status: 'failed' });
    expect(textOf(result)).toContain('Failed on server(s) 3');
  });

  it('forge_run_recipe runs a Forge recipe without a runs endpoint', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_run_recipe', { forge_recipe: 1, servers: [3], email: true });
    expect(paths()).toEqual(['POST /api/forge-recipes/1/runs']);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_server_events', runs: null });
  });

  it('forge_run_recipe needs exactly one recipe', async () => {
    harness = await createHarness({ env });
    expect((await harness.call('forge_run_recipe', { servers: [3] })).isError).toBe(true);
  });

  it('forge_list_recipe_runs reads a run with its output', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('organizations.recipes.runs.show', 200, { data: run('2', 3, 'finished') }) }],
    });
    const result = await harness.call('forge_list_recipe_runs', { recipe: 4, run: 2 });
    expect(paths()).toEqual([`GET ${RECIPES}/4/runs/2`]);
    expect(result.structuredContent).toMatchObject({ runs: [{ id: '2', server_id: 3 }], output: 'done' });
  });
});
