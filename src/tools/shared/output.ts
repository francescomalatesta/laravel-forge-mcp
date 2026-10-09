import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { ForgeApiError } from '../../forge/errors.js';
import { readResource } from './read.js';
import { tail } from './schemas.js';

/** Output of a command or scheduled job run, read from `{path}/output`. */
export const outputLinesInput = (fallback: number) =>
  z.number().int().min(0).max(5000).default(fallback).describe('Return only the last N lines of the output (0 = full output).');

export const outputFields = {
  output: z.string().nullable().describe('Output (last `output_lines` lines), or null when there is none yet.'),
  output_truncated: z.boolean(),
  output_total_lines: z.number().int().nullable(),
};

export type OutputFields = z.output<z.ZodObject<typeof outputFields>>;

export const NO_OUTPUT: OutputFields = { output: null, output_truncated: false, output_total_lines: null };

export async function fetchOutput(client: ForgeClient, path: string, lines: number, signal: AbortSignal): Promise<OutputFields> {
  try {
    const output = tail((await readResource(client, `${path}/output`, signal)).output as string | null | undefined, lines);
    return { output: output.text, output_truncated: output.truncated, output_total_lines: output.total_lines };
  } catch (error) {
    if (error instanceof ForgeApiError && error.status === 404) return NO_OUTPUT;
    throw error;
  }
}
