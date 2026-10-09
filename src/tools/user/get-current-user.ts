import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { pick } from '../shared/schemas.js';

export const getCurrentUser = defineTool({
  name: 'forge_get_current_user',
  title: 'Get current user',
  description: 'Show the Forge user the API token belongs to (name and email): useful to check which account the server is connected to.',
  toolset: 'core',
  operations: ['user.show'],
  permissions: ['user:view'],
  readOnly: true,
  inputSchema: {},
  outputSchema: {
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    created_at: z.string().nullable(),
  },
  async handler(_args, { client, signal }) {
    const user = pick(await readResource(client, '/user', signal), ['id', 'name', 'email', 'created_at']) as {
      id: string;
      name: string | null;
      email: string | null;
      created_at: string | null;
    };
    return { structured: user, summary: `The API token belongs to ${user.name} (${user.email}).` };
  },
});
