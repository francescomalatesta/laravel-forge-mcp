import { z } from 'zod';
import { flattenSingle, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput } from '../shared/schemas.js';
import {
  formatStorageProvider,
  STORAGE_PROVIDER_NOT_FOUND_HINT,
  STORAGE_PROVIDERS,
  storageProviderInput,
  storageProviderOutput,
  storageProviderPath,
  storageSettingsInput,
} from './shared.js';

const CHECK_WITH = 'forge_list_storage_providers';
const EXPOSED = ['name', 'provider', 'region', 'bucket', 'directory', 'endpoint', 'assume_role'] as const;

export const updateStorageProvider = defineTool({
  name: 'forge_update_storage_provider',
  title: 'Update storage provider',
  description:
    'Change the name, location (region, bucket, directory, endpoint) or credentials of a storage provider. Fields not passed keep their current value. Backup configurations using it pick up the change.',
  toolset: 'storage',
  operations: ['organizations.storage-providers.update', 'organizations.storage-providers.show'],
  permissions: ['storage:manage'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: STORAGE_PROVIDER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    storage_provider: storageProviderInput,
    name: z.string().min(1).max(255).optional().describe('New name.'),
    provider: z.enum(STORAGE_PROVIDERS).optional().describe('New provider type.'),
    ...storageSettingsInput,
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    storage_provider: storageProviderOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const { organization: _org, storage_provider, wait, timeout_seconds, ...changes } = args;
    if (Object.values(changes).every((value) => value === undefined)) throw new ToolInputError('Pass at least one setting to change.');
    if ((args.access_key === undefined) !== (args.secret_key === undefined)) {
      throw new ToolInputError('Pass both `access_key` and `secret_key` to change the credentials, or neither.');
    }
    const path = storageProviderPath(organization(args.organization), storage_provider);
    const current = await readResource(client, path, signal);
    // Name and provider are required: keep the current values of what is not changed.
    const body: Record<string, unknown> = { name: current.name, provider: current.provider };
    for (const field of ['region', 'bucket', 'directory', 'endpoint', 'assume_role'] as const) {
      if (current[field] !== null && current[field] !== undefined) body[field] = current[field];
    }
    for (const [field, value] of Object.entries(changes)) if (value !== undefined) body[field] = value;
    const response = await client.put<SingleDocument | undefined>(path, { body, signal });

    const action = `update storage provider ${storage_provider}`;
    const requested = EXPOSED.filter((field) => args[field] !== undefined);
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    if (!wait || requested.length === 0) {
      const accepted = queued(action, CHECK_WITH, requested.length === 0 ? '(credentials are never returned, so the change cannot be verified)' : undefined);
      return { ...accepted, structured: { ...accepted.structured, storage_provider: initial ? formatStorageProvider(initial) : null } };
    }

    const matches = (provider: FlatResource) => requested.every((field) => provider[field] === args[field]);
    const result = await waitFor({
      initial,
      poll: () => readResource(client, path, signal),
      phase: (provider) => (matches(provider) ? 'completed' : 'pending'),
      describe: (provider) => `Waiting for ${requested.filter((field) => provider[field] !== args[field]).join(', ')}`,
      timeoutSeconds: timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: timeout_seconds });
    return { structured: { ...done.structured, storage_provider: result.value ? formatStorageProvider(result.value) : null }, summary: done.summary };
  },
});
