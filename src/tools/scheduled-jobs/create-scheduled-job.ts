import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT } from '../shared/site-scope.js';
import {
  CRON_FREQUENCIES,
  formatScheduledJob,
  jobSiteInput,
  scheduledJobOperations,
  scheduledJobOutput,
  scheduledJobPhase,
  scheduledJobsPath,
} from './shared.js';

const CHECK_WITH = 'forge_list_scheduled_jobs';

export const createScheduledJob = defineTool({
  name: 'forge_create_scheduled_job',
  title: 'Create scheduled job',
  description:
    'Schedule a command (cron) on a server, or for a site with `site`. For the Laravel scheduler prefer forge_enable_site_integration with integration "scheduler". Optionally creates a heartbeat that alerts when the job stops running. Waits until it is installed unless `wait` is false.',
  toolset: 'jobs',
  operations: [...scheduledJobOperations('store'), ...scheduledJobOperations('show')],
  permissions: ['server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    site: jobSiteInput,
    command: z.string().min(1).describe('Command to run, e.g. "php /home/forge/example.com/current/artisan reports:send".'),
    frequency: z.enum(CRON_FREQUENCIES).describe('How often it runs; "custom" needs `cron`, "reboot" runs at boot.'),
    cron: z.string().min(1).optional().describe('Custom frequency only: cron expression, e.g. "*/15 * * * *".'),
    user: z.string().min(1).default('forge').describe('User the job runs as.'),
    name: z.string().min(1).optional().describe('Name of the job.'),
    heartbeat: z.boolean().optional().describe('Create a heartbeat that alerts when the job does not run.'),
    grace_period: z
      .union([z.literal(1), z.literal(2), z.literal(5), z.literal(10), z.literal(30), z.literal(60)])
      .optional()
      .describe('Heartbeat only: minutes of delay tolerated before alerting.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    job: scheduledJobOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    if (args.frequency === 'custom' && !args.cron) throw new ToolInputError('A custom frequency needs a `cron` expression.');
    if (args.frequency !== 'custom' && args.cron) throw new ToolInputError('`cron` is only used with frequency "custom".');
    if (args.grace_period !== undefined && !args.heartbeat) throw new ToolInputError('`grace_period` is only used with `heartbeat: true`.');

    const base = scheduledJobsPath(organization(args.organization), args.server, args.site);
    const response = await client.post<SingleDocument | undefined>(base, {
      body: {
        name: args.name,
        command: args.command,
        user: args.user,
        frequency: args.frequency,
        cron: args.cron,
        heartbeat: args.heartbeat,
        grace_period: args.grace_period,
      },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `schedule \`${args.command}\``;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, job: initial ? formatScheduledJob(initial) : null },
        summary: `Forge accepted the request to ${action}. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readResource(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (job) => scheduledJobPhase(job.status),
      describe: (job) => `Scheduled job is ${job.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const job = formatScheduledJob(result.value ?? initial);
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds, detail: `Job ID: ${job.id}.` });
    return { structured: { ...done.structured, job }, summary: done.summary };
  },
});
