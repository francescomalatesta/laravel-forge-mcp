import { z } from 'zod';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';

export function sshKeysPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/ssh-keys`;
}

export const sshKeyInput = idInput('SSH key ID. Use forge_list_ssh_keys to find it.');

const FIELDS = ['id', 'name', 'user', 'status', 'created_by', 'created_at', 'updated_at'] as const;

export const sshKeyOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  user: z.string().nullable().describe('Server user the key logs in as.'),
  status: z.string().nullable().describe('e.g. installing, installed, removing.'),
  created_by: z.number().nullable().describe('Forge user who added the key.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type SshKeyOutput = z.output<typeof sshKeyOutput>;

export function formatSshKey(flat: Record<string, unknown>): SshKeyOutput {
  return pick(flat, FIELDS) as SshKeyOutput;
}

export const serverKeyOutput = z.looseObject({
  public_key: z.string().nullable().describe('Add it where the server must authenticate (Git providers, other servers).'),
  fingerprint: z.string().nullable(),
});
