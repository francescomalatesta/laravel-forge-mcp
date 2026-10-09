import { z } from 'zod';
import { redact } from '../shared/secrets.js';
import { sitePath } from '../shared/site-scope.js';

export const MANAGERS = ['composer', 'npm'] as const;
export type Manager = (typeof MANAGERS)[number];

export const managerInput = z.enum(MANAGERS).describe('composer (private Composer repositories) or npm (private npm registries).');

export const credentialKeyInput = z
  .string()
  .min(1)
  .describe('Composer repository host (e.g. "repo.packagist.com") or npm registry (e.g. "npm.pkg.github.com").');

export function credentialsPath(org: string, server: string | number, site: string | number, manager: Manager): string {
  return `${sitePath(org, server, site)}/${manager}/credentials`;
}

export function credentialPath(org: string, server: string | number, site: string | number, manager: Manager, key: string): string {
  return `${credentialsPath(org, server, site, manager)}/${encodeURIComponent(key)}`;
}

export function credentialOperations(verb: string): string[] {
  return MANAGERS.map((manager) => `organizations.servers.sites.${manager}.credentials.${verb}`);
}

export const credentialOutput = z.looseObject({
  manager: z.enum(MANAGERS),
  repository: z.string().nullable().describe('Composer repository or npm registry.'),
  username: z.string().nullable().describe('Composer only.'),
  scopes: z.array(z.string()).nullable().describe('npm only: package scopes served by the registry.'),
  secret: z.string().nullable().describe('Password (Composer) or token (npm), hidden unless secrets are allowed.'),
});

export type CredentialOutput = z.output<typeof credentialOutput>;

export function formatCredential(manager: Manager, flat: Record<string, unknown>, allowSecrets: boolean): CredentialOutput {
  const composer = manager === 'composer';
  const secret = (composer ? flat.password : flat.token) as string | undefined;
  return redact(
    {
      manager,
      repository: ((composer ? flat.repository : flat.registry) as string | undefined) ?? null,
      username: composer ? ((flat.username as string | undefined) ?? null) : null,
      scopes: composer ? null : ((flat.scopes as string[] | undefined) ?? null),
      secret: secret ?? null,
    },
    ['secret'],
    allowSecrets,
  );
}
