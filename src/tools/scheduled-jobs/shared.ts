import { z } from 'zod';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick, siteInput } from '../shared/schemas.js';
import { sitePath } from '../shared/site-scope.js';
import { serverPath } from '../servers/shared.js';

export const CRON_FREQUENCIES = ['minutely', 'hourly', 'nightly', 'weekly', 'monthly', 'reboot', 'custom'] as const;

/** Scheduled jobs exist on servers and on sites: the same endpoints with or without the site segment. */
export function scheduledJobsPath(org: string, server: string | number, site?: string | number): string {
  return `${site === undefined ? serverPath(org, server) : sitePath(org, server, site)}/scheduled-jobs`;
}

export function scheduledJobPath(org: string, server: string | number, site: string | number | undefined, job: string | number): string {
  return `${scheduledJobsPath(org, server, site)}/${encodeURIComponent(String(job))}`;
}

/** OperationIds of an endpoint at both levels, e.g. "organizations.servers.scheduled-jobs.show" and the site one. */
export function scheduledJobOperations(suffix: string): string[] {
  return [`organizations.servers.scheduled-jobs.${suffix}`, `organizations.servers.sites.scheduled-jobs.${suffix}`];
}

export const jobSiteInput = siteInput
  .optional()
  .describe('Site ID for jobs that belong to a site; omit for server-level jobs. Use forge_list_sites to find it.');

export const jobInput = idInput('Scheduled job ID. Use forge_list_scheduled_jobs to find it.');

export const JOB_NOT_FOUND_HINT =
  'Check the job ID with forge_list_scheduled_jobs, using the same server and (for site jobs) site.';

const FIELDS = ['id', 'name', 'command', 'user', 'frequency', 'cron', 'status', 'next_run_time', 'created_at', 'updated_at'] as const;

export const scheduledJobOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  command: z.string().nullable(),
  user: z.string().nullable(),
  frequency: z.string().nullable(),
  cron: z.string().nullable().describe('Cron expression the job runs on.'),
  status: z.string().nullable().describe('e.g. installing, installed, removing.'),
  next_run_time: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type ScheduledJobOutput = z.output<typeof scheduledJobOutput>;

export function formatScheduledJob(flat: Record<string, unknown>): ScheduledJobOutput {
  return pick(flat, FIELDS) as ScheduledJobOutput;
}

export function scheduledJobPhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['installing', 'removing', 'updating'], failed: ['failed'] });
}
