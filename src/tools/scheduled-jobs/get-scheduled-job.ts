import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { fetchOutput, NO_OUTPUT, outputFields, outputLinesInput } from '../shared/output.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import {
  formatScheduledJob,
  JOB_NOT_FOUND_HINT,
  jobInput,
  jobSiteInput,
  scheduledJobOperations,
  scheduledJobOutput,
  scheduledJobPath,
} from './shared.js';

export const getScheduledJob = defineTool({
  name: 'forge_get_scheduled_job',
  title: 'Get scheduled job',
  description: 'Get a scheduled job with the end of the output of its last run. Pass `site` for jobs that belong to a site.',
  toolset: 'jobs',
  operations: [...scheduledJobOperations('show'), ...scheduledJobOperations('outputs.show')],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: JOB_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    site: jobSiteInput,
    job: jobInput,
    include_output: z.boolean().default(true).describe('Also fetch the output of the last run.'),
    output_lines: outputLinesInput(100),
  },
  outputSchema: {
    job: scheduledJobOutput,
    ...outputFields,
  },
  async handler(args, { client, organization, signal }) {
    const path = scheduledJobPath(organization(args.organization), args.server, args.site, args.job);
    const [job, output] = await Promise.all([
      readResource(client, path, signal).then(formatScheduledJob),
      args.include_output ? fetchOutput(client, path, args.output_lines, signal) : Promise.resolve(NO_OUTPUT),
    ]);
    return {
      structured: { job, ...output },
      summary: `\`${job.command}\` runs ${job.frequency} (${job.cron}) as ${job.user}; next run: ${job.next_run_time}.`,
    };
  },
});
