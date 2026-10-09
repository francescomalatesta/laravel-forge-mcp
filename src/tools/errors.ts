import { ForgeApiError, ForgeConnectionError } from '../forge/errors.js';
import type { AnyToolDefinition } from './define-tool.js';

/** A problem with the tool arguments that the model can fix itself. */
export class ToolInputError extends Error {
  override name = 'ToolInputError';
}

export const MISSING_ORGANIZATION_MESSAGE =
  'No organization specified. Pass the `organization` argument (the organization slug) or set FORGE_ORGANIZATION. Use forge_list_organizations to find available slugs.';

/**
 * Turns any failure into an actionable message: what went wrong and what the
 * model (or the user) can do about it.
 */
export function describeToolError(error: unknown, tool: AnyToolDefinition): string {
  if (error instanceof ToolInputError) {
    return error.message;
  }

  if (error instanceof ForgeConnectionError) {
    return error.timedOut
      ? `${error.message} Forge may be slow or unavailable; try again shortly.`
      : `${error.message} Check network connectivity and FORGE_API_URL.`;
  }

  if (error instanceof ForgeApiError) {
    return describeApiError(error, tool);
  }

  const message = error instanceof Error ? error.message : String(error);
  return `Unexpected error while running ${tool.name}: ${message}`;
}

function describeApiError(error: ForgeApiError, tool: AnyToolDefinition): string {
  const detail = error.message.trim().replace(/[.\s]+$/, '');

  switch (error.status) {
    case 400:
      return `Forge rejected the request (400 Bad Request): ${detail}.`;
    case 401:
      return 'Authentication with Forge failed (401): the API token is missing, invalid, expired or revoked. Ask the user to check FORGE_API_TOKEN.';
    case 403: {
      const permissions = tool.permissions.length > 0 ? ` This action requires the Forge permission(s): ${tool.permissions.join(', ')}.` : '';
      return `Forbidden (403): ${detail}.${permissions} The API token scopes or the user's role in the organization may not allow it.`;
    }
    case 404:
      return `Not found (404): ${detail}.${tool.notFoundHint ? ` ${tool.notFoundHint}` : ''}`;
    case 409:
      return `Conflict (409): ${detail}. The resource may be busy (e.g. another operation is in progress); try again later.`;
    case 422:
      return `Validation failed (422): ${detail}.${formatValidationErrors(error.validationErrors)}`;
    case 429: {
      const wait = error.retryAfterSeconds !== undefined ? ` Retry after ${error.retryAfterSeconds} seconds.` : ' Wait a minute before retrying.';
      return `Rate limited by Forge (429): too many requests.${wait}`;
    }
    case 503:
      return 'Forge is temporarily unavailable (503), possibly down for maintenance. Try again later.';
    default:
      if (error.status >= 500) {
        return `Forge returned a server error (${error.status}): ${detail}. Try again later.`;
      }
      return `Forge returned an error (${error.status}): ${detail}.`;
  }
}

function formatValidationErrors(errors: Record<string, string[]> | undefined): string {
  if (!errors) return '';
  const lines = Object.entries(errors).map(([field, messages]) => `- ${field}: ${[messages].flat().join(' ')}`);
  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
}
