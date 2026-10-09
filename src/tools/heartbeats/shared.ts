import { z } from 'zod';
import { ToolInputError } from '../errors.js';
import { redact } from '../shared/secrets.js';
import { idInput, pick } from '../shared/schemas.js';
import { sitePath } from '../shared/site-scope.js';

export function heartbeatsPath(org: string, server: string | number, site: string | number): string {
  return `${sitePath(org, server, site)}/heartbeats`;
}

export const heartbeatInput = idInput('Heartbeat ID. Use forge_list_heartbeats to find it.');

export const HEARTBEAT_NOT_FOUND_HINT = 'Check the heartbeat ID with forge_list_heartbeats.';

/** Minutes between expected pings (-1 = custom cron). */
const FREQUENCIES = [1, 5, 10, 30, 60, 1440, 10080, 312480] as const;
const GRACE_PERIODS = [1, 2, 5, 10, 30, 60] as const;

export const frequencyInput = z.literal(FREQUENCIES).describe(
  'Minutes between expected pings: 1, 5, 10, 30, 60, 1440 (daily), 10080 (weekly) or 312480. Use `cron` instead for other schedules.',
);
export const cronInput = z.string().min(1).describe('Cron expression of the expected pings, e.g. "0 3 * * *" (instead of `frequency`).');
export const gracePeriodInput = z.literal(GRACE_PERIODS).describe('Minutes of delay tolerated before the heartbeat is reported missing: 1, 2, 5, 10, 30 or 60.');

/** Maps `frequency` / `cron` to the API fields (frequency -1 means custom). */
export function scheduleBody(frequency: number | undefined, cron: string | undefined) {
  if ((frequency === undefined) === (cron === undefined)) throw new ToolInputError('Pass either `frequency` or `cron`.');
  return cron === undefined ? { frequency } : { frequency: -1, custom_frequency: cron };
}

const FIELDS = ['id', 'name', 'status', 'frequency', 'custom_frequency', 'grace_period', 'ping_url'] as const;

export const heartbeatOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  status: z.string().nullable().describe('pending (no ping yet), beating or missing.'),
  frequency: z.number().nullable().describe('Minutes between expected pings; -1 = custom cron.'),
  custom_frequency: z.string().nullable(),
  grace_period: z.number().nullable(),
  ping_url: z.string().nullable().describe('URL the job must request after each run (hidden unless secrets are allowed).'),
});

export type HeartbeatOutput = z.output<typeof heartbeatOutput>;

/** The ping URL lets anyone report the job as alive: it is a secret. */
export function formatHeartbeat(flat: Record<string, unknown>, allowSecrets: boolean): HeartbeatOutput {
  return redact(pick(flat, FIELDS), ['ping_url'], allowSecrets) as HeartbeatOutput;
}
