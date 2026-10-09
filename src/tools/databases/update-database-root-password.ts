import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from '../servers/shared.js';
import { passwordInput } from './shared.js';

export const updateDatabaseRootPassword = defineTool({
  name: 'forge_update_database_root_password',
  title: 'Change database root password',
  description:
    "Change the password of the database server's root user (the `forge` user on Forge-provisioned servers). Applications or tools using the old root password stop connecting.",
  toolset: 'databases',
  operations: ['organizations.servers.database.password.update'],
  permissions: ['server:manage-services'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    password: passwordInput.describe('New root password (never returned).'),
  },
  outputSchema: {
    updated: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.put(`${serverPath(organization(args.organization), args.server)}/database/password`, {
      body: { password: args.password },
      signal,
    });
    return { structured: { updated: true }, summary: 'Database root password changed.' };
  },
});
