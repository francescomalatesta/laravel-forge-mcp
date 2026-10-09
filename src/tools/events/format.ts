import { z } from 'zod';
import { relatedField, relatedId } from '../shared/relationships.js';

export const eventOutput = z.looseObject({
  id: z.string().describe('Event ID, used as the `event` argument of forge_get_server_event.'),
  description: z.string().nullable(),
  ran_as: z.string().nullable().describe('Server user the operation ran as.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  site_id: z.string().nullable(),
  site_name: z.string().nullable(),
  initiator_name: z.string().nullable().describe('User who triggered the event.'),
});

export type EventOutput = z.output<typeof eventOutput>;

export function formatEvent(flat: Record<string, unknown>): EventOutput {
  return {
    id: String(flat.id),
    description: (flat.description as string | undefined) ?? null,
    ran_as: (flat.ran_as as string | undefined) ?? null,
    created_at: (flat.created_at as string | undefined) ?? null,
    updated_at: (flat.updated_at as string | undefined) ?? null,
    site_id: relatedId(flat, 'site'),
    site_name: (relatedField(flat, 'site', 'name') as string | null) ?? null,
    initiator_name: (relatedField(flat, 'initiator', 'name') as string | null) ?? null,
  };
}
