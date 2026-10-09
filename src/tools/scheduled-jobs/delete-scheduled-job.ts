import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { JOB_NOT_FOUND_HINT, jobInput, jobSiteInput, scheduledJobOperations, scheduledJobPath } from './shared.js';

const CHECK_WITH = 'forge_list_scheduled_jobs';

export const deleteScheduledJob = defineTool({
  name: 'forge_delete_scheduled_job',
  title: 'Delete scheduled job',
  description: 'Remove a scheduled job from a server (or site, with `site`): the command stops running.',
  toolset: 'jobs',
  operations: [...scheduledJobOperations('destroy'), ...scheduledJobOperations('show')],
  permissions: ['server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: JOB_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    site: jobSiteInput,
    job: jobInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = scheduledJobPath(organization(args.organization), args.server, args.site, args.job);
    await client.delete(path, { signal });
    const action = `delete scheduled job ${args.job}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (job) => (job === null ? 'completed' : 'pending'),
      describe: (job) => `Scheduled job is ${job?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
