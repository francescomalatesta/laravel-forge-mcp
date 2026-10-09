import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput, serverInput, tail } from '../shared/schemas.js';
import { eventOutput, formatEvent } from './format.js';

export const getServerEvent = defineTool({
  name: 'forge_get_server_event',
  title: 'Get server event',
  description:
    'Get a server event and the output of the script Forge ran for it (the last `output_lines` lines). Use it to see why a background operation failed.',
  toolset: 'core',
  operations: ['organizations.servers.events.show', 'organizations.servers.events.output.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the event ID with forge_list_server_events.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    event: idInput('Event ID. Use forge_list_server_events to find it.'),
    include_output: z.boolean().default(true).describe('Also fetch the output of the event script.'),
    output_lines: z
      .number()
      .int()
      .min(0)
      .max(5000)
      .default(200)
      .describe('Return only the last N lines of the output (0 = full output).'),
  },
  outputSchema: {
    event: eventOutput,
    output: z.string().nullable().describe('Event script output, or null when not requested.'),
    output_truncated: z.boolean(),
    output_total_lines: z.number().int().nullable(),
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const base = apiPath`/orgs/${org}/servers/${args.server}/events/${args.event}`;
    const [eventResponse, outputResponse] = await Promise.all([
      client.get<SingleDocument>(base, { signal }),
      args.include_output ? client.get<SingleDocument>(`${base}/output`, { signal }) : Promise.resolve(undefined),
    ]);

    const event = formatEvent(flattenSingle(eventResponse.data));
    const rawOutput = outputResponse ? (flattenSingle(outputResponse.data).output as string | null | undefined) : undefined;
    const output = rawOutput === undefined ? undefined : tail(rawOutput, args.output_lines);

    return {
      structured: {
        event,
        output: output?.text ?? null,
        output_truncated: output?.truncated ?? false,
        output_total_lines: output?.total_lines ?? null,
      },
      summary: `Event ${event.id}: "${event.description}" (${event.created_at}).${
        output?.truncated ? ` Output shows the last ${args.output_lines} of ${output.total_lines} lines.` : ''
      }`,
    };
  },
});
