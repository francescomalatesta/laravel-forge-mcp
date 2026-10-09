import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const TEAMS = '/api/orgs/acme/teams';
const env = { FORGE_TOOLSETS: 'core,teams' };
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const team = (name = 'Developers') => specSchema('TeamResource', { id: '2', attributes: { name } });
const role = { type: 'predefinedRoles', id: '8' };

describe('teams', () => {
  it('forge_create_team maps members and invites to the API shape', async () => {
    harness = await createHarness({ env, responses: [{ body: specResponse('organizations.teams.store', 200, { data: team() }) }] });
    await harness.call('forge_create_team', {
      name: 'Developers',
      members: [{ user: 11, role: 8 }],
      invites: [{ email: 'new@example.com', role: '8' }],
    });
    expect(harness.requests[0]?.body).toEqual({
      name: 'Developers',
      users: [{ id: 11, role: { id: 8 } }],
      invites: [{ email: 'new@example.com', role: { id: 8 } }],
    });
  });

  it('forge_update_team keeps the name when only members change', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.teams.show', 200, { data: team() }) },
        { body: specResponse('organizations.teams.update', 200, { data: team() }) },
      ],
    });
    await harness.call('forge_update_team', { team: 2, members: [{ user: 11 }] });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { name: 'Developers', users: [{ id: 11 }] } });
  });

  it('forge_list_teams and forge_delete_team', async () => {
    harness = await createHarness({ env, responses: [{ body: specResponse('organizations.teams.index', 200, { data: [team()] }) }, { status: 204 }] });
    const list = await harness.call('forge_list_teams', {});
    expect(textOf(list)).toMatch(/Developers \(2\)/);
    await harness.call('forge_delete_team', { team: 2 });
    expect(paths()).toEqual([`GET ${TEAMS}`, `DELETE ${TEAMS}/2`]);
  });

  it('members: list with roles, change role, remove', async () => {
    const member = specSchema('MembershipResource', {
      id: '11',
      attributes: { name: 'Jane', email: 'jane@example.com' },
      relationships: { role: { data: role } },
    });
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.teams.members.index', 200, { data: [member] }) },
        { body: specResponse('organizations.teams.members.update', 200, { data: member }) },
        { status: 204 },
      ],
    });
    const list = await harness.call('forge_list_team_members', { team: 2 });
    expect(list.structuredContent).toMatchObject({ members: [{ id: '11', email: 'jane@example.com', role_id: '8' }] });
    await harness.call('forge_update_team_member', { team: 2, user: 11, role: 8 });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { role_id: 8 } });
    await harness.call('forge_remove_team_member', { team: 2, user: 11 });
    expect(paths()).toEqual([`GET ${TEAMS}/2/members`, `PUT ${TEAMS}/2/members/11`, `DELETE ${TEAMS}/2/members/11`]);
  });

  it('invitations: invite, list, cancel', async () => {
    const invitation = specSchema('TeamInvitationResource', {
      id: '5',
      attributes: { email: 'new@example.com' },
      relationships: { role: { data: role }, team: { data: null }, organization: { data: null } },
    });
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.teams.invites.store', 200, { data: invitation }) },
        { body: specResponse('organizations.teams.invites.index', 200, { data: [invitation] }) },
        { status: 204 },
      ],
    });
    const invited = await harness.call('forge_invite_team_member', { team: 2, email: 'new@example.com', role: 8 });
    expect(harness.requests[0]?.body).toEqual({ email: 'new@example.com', role_id: 8 });
    expect(invited.structuredContent).toMatchObject({ status: 'completed', invitation: { id: '5', role_id: '8' } });
    await harness.call('forge_list_team_invitations', { team: 2 });
    await harness.call('forge_cancel_team_invitation', { team: 2, invitation: 5 });
    expect(paths()).toEqual([`POST ${TEAMS}/2/invites`, `GET ${TEAMS}/2/invites`, `DELETE ${TEAMS}/2/invites/5`]);
  });

  it('shares servers, recipes and credentials with a team', async () => {
    const credential = specSchema('ServerCredentialResource', { id: '9', attributes: { name: 'DO' } });
    harness = await createHarness({
      env,
      responses: [
        { status: 201, body: specResponse('organizations.teams.server-credentials.store', 201, { data: credential }) },
        { body: specResponse('organizations.teams.server-credentials.index', 200, { data: [credential] }) },
        { status: 204 },
        { status: 201, body: specResponse('organizations.teams.recipes.store', 201, { data: specSchema('RecipeResource', { id: '4' }) }) },
      ],
    });
    await harness.call('forge_share_with_team', { team: 2, resource: 'credentials', id: 9 });
    expect(harness.requests[0]?.body).toEqual({ credential_id: 9 });
    const list = await harness.call('forge_list_team_resources', { team: 2, resource: 'credentials' });
    expect(list.structuredContent).toMatchObject({ items: [{ id: '9', name: 'DO' }] });
    await harness.call('forge_unshare_from_team', { team: 2, resource: 'servers', id: 3 });
    await harness.call('forge_share_with_team', { team: 2, resource: 'recipes', id: 4 });
    expect(harness.requests[3]?.body).toEqual({ recipe_id: 4 });
    expect(paths()).toEqual([
      `POST ${TEAMS}/2/server-credentials`,
      `GET ${TEAMS}/2/server-credentials`,
      `DELETE ${TEAMS}/2/servers/3`,
      `POST ${TEAMS}/2/recipes`,
    ]);
  });
});

describe('roles and permissions', () => {
  const customRole = (permissions: unknown[] = []) =>
    specSchema('CustomRoleResource', { id: '8', attributes: { name: 'Deployer' }, relationships: { permissions: { data: permissions } } });

  it('forge_list_roles includes permission names when asked', async () => {
    harness = await createHarness({
      env,
      responses: [
        {
          body: specResponse('organizations.roles.index', 200, {
            data: [customRole([{ type: 'permissions', id: '1' }])],
            included: [specSchema('PermissionResource', { id: '1', attributes: { name: 'site:manage-deploys' } })],
          }),
        },
      ],
    });
    const result = await harness.call('forge_list_roles', { include_permissions: true, permission: 'site:manage-deploys' });
    expect(harness.requests[0]?.url.searchParams.get('include')).toBe('permissions');
    expect(harness.requests[0]?.url.searchParams.get('filter[permissions.name]')).toBe('site:manage-deploys');
    expect(result.structuredContent).toMatchObject({ roles: [{ id: '8', permissions: ['site:manage-deploys'] }] });
  });

  it('forge_list_roles lists predefined roles', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('predefined-roles.index', 200, { data: [specSchema('PredefinedRoleResource', { id: '1', attributes: { name: 'Admin' } })] }) }],
    });
    await harness.call('forge_list_roles', { scope: 'predefined' });
    expect(paths()).toEqual(['GET /api/predefined-roles']);
  });

  it('forge_list_permissions lists all permissions or those of a role', async () => {
    const permissions = { body: specResponse('permissions.index', 200, { data: [specSchema('PermissionResource', { id: '1', attributes: { name: 'server:view' } })] }) };
    harness = await createHarness({
      env,
      responses: [permissions, { body: specResponse('organizations.roles.permissions.index', 200, { data: [] }) }],
    });
    await harness.call('forge_list_permissions', {});
    await harness.call('forge_list_permissions', { role: 8 });
    expect(paths()).toEqual(['GET /api/permissions', 'GET /api/orgs/acme/roles/8/permissions']);
  });

  it('forge_create_role, forge_update_role and forge_delete_role', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.roles.store', 200, { data: customRole() }) },
        { body: specResponse('organizations.roles.show', 200, { data: customRole() }) },
        { body: specResponse('organizations.roles.update', 200, { data: customRole() }) },
        { status: 204 },
      ],
    });
    await harness.call('forge_create_role', { name: 'Deployer', permissions: ['server:view', 'site:manage-deploys'] });
    expect(harness.requests[0]?.body).toEqual({ name: 'Deployer', permissions: ['server:view', 'site:manage-deploys'] });
    await harness.call('forge_update_role', { role: 8, permissions: ['server:view'] });
    expect(harness.requests[2]).toMatchObject({ method: 'PUT', body: { name: 'Deployer', permissions: ['server:view'] } });
    await harness.call('forge_delete_role', { role: 8 });
    expect(paths().at(-1)).toBe('DELETE /api/orgs/acme/roles/8');
  });

  it('rejects malformed permission names', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_role', { name: 'x', permissions: ['deploy everything'] });
    expect(result.isError).toBe(true);
  });
});
