import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatMonitor, MONITOR_TYPES, monitorOutput, monitorPhase, monitorsPath } from './shared.js';

const CHECK_WITH = 'forge_list_monitors';

export const createMonitor = defineTool({
  name: 'forge_create_monitor',
  title: 'Create monitor',
  description:
    'Alert by email when a server metric crosses a threshold, e.g. disk ≥ 80 (%), used_memory ≥ 90 (%), cpu_load ≥ 4 for 5 minutes. Waits until the monitor is installed unless `wait` is false.',
  toolset: 'monitoring',
  operations: ['organizations.servers.monitors.store', 'organizations.servers.monitors.show'],
  permissions: ['server:create-monitors', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    type: z.enum(MONITOR_TYPES).describe('Metric: cpu_load (load average), disk (% used), free_memory or used_memory (%).'),
    operator: z.enum(['gte', 'lte']).default('gte').describe('gte: alert at or above the threshold; lte: at or below.'),
    threshold: z.number().describe('Threshold, e.g. 80.'),
    minutes: z.number().int().min(1).optional().describe('Minutes the condition must last before alerting.'),
    notify: z.string().email().describe('Email to notify.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    monitor: monitorOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = monitorsPath(organization(args.organization), args.server);
    const response = await client.post<SingleDocument | undefined>(base, {
      body: { type: args.type, operator: args.operator, threshold: args.threshold, minutes: args.minutes, notify: args.notify },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `monitor ${args.type} ${args.operator} ${args.threshold}`;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, monitor: initial ? formatMonitor(initial) : null },
        summary: `Forge accepted the request to ${action}. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readResource(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (monitor) => monitorPhase(monitor.status),
      describe: (monitor) => `Monitor is ${monitor.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const monitor = formatMonitor(result.value ?? initial);
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds, detail: `Monitor ID: ${monitor.id}.` });
    return { structured: { ...done.structured, monitor }, summary: done.summary };
  },
});
