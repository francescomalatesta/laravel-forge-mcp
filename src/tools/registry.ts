import type { Config } from '../config.js';
import type { AnyToolDefinition } from './define-tool.js';
import { listOrganizations } from './organizations/list-organizations.js';
import { listServers } from './servers/list-servers.js';

/** Every tool shipped by the server. Add new tools here. */
export const ALL_TOOLS: readonly AnyToolDefinition[] = [listOrganizations, listServers];

/** Tools enabled by the configuration (toolsets, read-only mode, secrets opt-in). */
export function selectTools(
  config: Pick<Config, 'toolsets' | 'readOnly' | 'allowSecrets'>,
  tools: readonly AnyToolDefinition[] = ALL_TOOLS,
): AnyToolDefinition[] {
  return tools.filter(
    (tool) =>
      config.toolsets.has(tool.toolset) &&
      (!config.readOnly || tool.readOnly) &&
      (config.allowSecrets || !tool.exposesSecrets),
  );
}
