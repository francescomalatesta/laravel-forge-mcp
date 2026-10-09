import { z } from 'zod';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';

export function monitorsPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/monitors`;
}

export const monitorInput = idInput('Monitor ID. Use forge_list_monitors to find it.');

export const MONITOR_TYPES = ['cpu_load', 'disk', 'free_memory', 'used_memory'] as const;

const FIELDS = ['id', 'type', 'operator', 'threshold', 'minutes', 'notify', 'state', 'state_changed_at', 'status', 'created_at'] as const;

export const monitorOutput = z.looseObject({
  id: z.string(),
  type: z.string().nullable().describe('cpu_load, disk (% used), free_memory or used_memory (%).'),
  operator: z.string().nullable().describe('gte (alert at or above the threshold) or lte (at or below).'),
  threshold: z.number().nullable(),
  minutes: z.number().nullable().describe('Minutes the condition must last before alerting.'),
  notify: z.string().nullable().describe('Email notified on alerts.'),
  state: z.string().nullable().describe('OK, ALERT or UNKNOWN.'),
  state_changed_at: z.string().nullable(),
  status: z.string().nullable().describe('Installation status, e.g. installing, installed.'),
  created_at: z.string().nullable(),
});

export type MonitorOutput = z.output<typeof monitorOutput>;

export function formatMonitor(flat: Record<string, unknown>): MonitorOutput {
  return pick(flat, FIELDS) as MonitorOutput;
}

export function monitorPhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['installing', 'updating', 'enabling', 'syncing', 'removing'], failed: ['failed', 'failed-unknown', 'failed-runner'] });
}
