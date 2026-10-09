import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT } from '../shared/site-scope.js';
import { formatScheduledJob, jobSiteInput, scheduledJobOperations, scheduledJobOutput, scheduledJobsPath } from './shared.js';

const SORT = ['created_at', '-created_at', 'updated_at', '-updated_at', 'status', '-status'] as const;

export const listScheduledJobs = defineTool({
  name: 'forge_list_scheduled_jobs',
  title: 'List scheduled jobs',
  description:
    'List the scheduled jobs (cron) of a server, or of one site with `site`: command, user, frequency, next run. Read the output of the last run with forge_get_scheduled_job.',
  toolset: 'jobs',
  operations: scheduledJobOperations('index'),
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    site: jobSiteInput,
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    user: z.string().min(1).optional().describe('Filter by the user the job runs as.'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    jobs: z.array(scheduledJobOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(scheduledJobsPath(organization(args.organization), args.server, args.site), {
      query: { filter: { status: args.status, user: args.user }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const jobs = page.items.map(formatScheduledJob);
    return {
      structured: { jobs, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        jobs.length === 0
          ? 'No scheduled jobs found.'
          : `Found ${jobs.length} scheduled job(s): ${jobs.map((job) => `\`${job.command}\` (${job.id}, ${job.frequency})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
