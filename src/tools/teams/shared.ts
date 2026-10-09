import { z } from 'zod';
import { apiPath } from '../../forge/path.js';
import { relatedId } from '../shared/relationships.js';
import { idInput, pick } from '../shared/schemas.js';

export function teamsPath(org: string): string {
  return apiPath`/orgs/${org}/teams`;
}

export function teamPath(org: string, team: string | number): string {
  return `${teamsPath(org)}/${encodeURIComponent(String(team))}`;
}

export const teamInput = idInput('Team ID. Use forge_list_teams to find it.');
export const roleIdInput = idInput('Role ID. Use forge_list_roles to find it (predefined or custom roles).');

export const TEAM_NOT_FOUND_HINT = 'Check the team ID with forge_list_teams.';

export const teamOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  created_at: z.string().nullable(),
});

export function formatTeam(flat: Record<string, unknown>) {
  return pick(flat, ['id', 'name', 'created_at']) as z.output<typeof teamOutput>;
}

export const memberOutput = z.looseObject({
  id: z.string().describe('User ID of the member.'),
  name: z.string().nullable(),
  email: z.string().nullable(),
  role_id: z.string().nullable(),
});

export function formatMember(flat: Record<string, unknown>) {
  return { ...(pick(flat, ['id', 'name', 'email']) as { id: string; name: string | null; email: string | null }), role_id: relatedId(flat, 'role') };
}

export const invitationOutput = z.looseObject({
  id: z.string(),
  email: z.string().nullable(),
  role_id: z.string().nullable(),
  created_at: z.string().nullable(),
});

export function formatInvitation(flat: Record<string, unknown>) {
  return {
    ...(pick(flat, ['id', 'email', 'created_at']) as { id: string; email: string | null; created_at: string | null }),
    role_id: relatedId(flat, 'role'),
  };
}

/** Members passed to create/update a team, mapped to the API shape `{ id, role: { id } }`. */
export const membersInput = z
  .array(z.object({ user: idInput('User ID.'), role: roleIdInput.optional() }))
  .describe('Organization users in the team, with their role.');

export function membersBody(members: readonly { user: string | number; role?: string | number | undefined }[]) {
  return members.map((member) => ({ id: Number(member.user), ...(member.role === undefined ? {} : { role: { id: Number(member.role) } }) }));
}
