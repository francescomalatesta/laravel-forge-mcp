import { z } from 'zod';

/**
 * Forge processes many write operations asynchronously (HTTP 202): the request
 * is accepted and the work continues in the background. Tools must say so and
 * point to the tool that shows the outcome.
 */
export const queuedOutput = {
  status: z.literal('queued').describe('Forge accepted the request; the work continues in the background.'),
  check_with: z.string().describe('Tool to call to follow the outcome.'),
};

export function queued(action: string, checkWith: string, hint?: string) {
  return {
    structured: { status: 'queued' as const, check_with: checkWith },
    summary: `Forge accepted the request to ${action}; it runs in the background. Check the outcome with ${checkWith}${hint ? ` ${hint}` : ''}.`,
  };
}
