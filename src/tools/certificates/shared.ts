import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';

export const certificateInput = idInput('Certificate ID. Use forge_list_certificates to find it.');

export const CERTIFICATE_NOT_FOUND_HINT = 'Check the domain ID with forge_list_domains and the certificate ID with forge_list_certificates.';

const CERTIFICATE_FIELDS = [
  'id',
  'type',
  'status',
  'request_status',
  'active',
  'verification_method',
  'key_type',
  'preferred_chain',
  'created_at',
  'updated_at',
] as const;

export const certificateOutput = z.looseObject({
  id: z.string().describe('Certificate ID.'),
  type: z.string().nullable().describe('letsencrypt, csr or existing.'),
  status: z.string().nullable().describe('installing, installed, failed, renewing, ...'),
  request_status: z.string().nullable().describe('verifying, creating or created.'),
  active: z.boolean().nullable().describe('Whether the certificate is the one served for the domain.'),
  verification_method: z.string().nullable(),
  key_type: z.string().nullable(),
  preferred_chain: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type CertificateOutput = z.output<typeof certificateOutput>;

export function formatCertificate(flat: Record<string, unknown>): CertificateOutput {
  return pick(flat, CERTIFICATE_FIELDS) as CertificateOutput;
}

export async function readCertificate(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(path, { signal });
  return flattenSingle(response.data);
}

const FAILED = ['failed', 'failed-unknown', 'failed-runner'];
const TRANSITIONAL = ['installing', 'removing', 'restarting', 'stopping', 'starting', 'syncing', 'updating', 'disabling', 'enabling', 'restoring', 'deleting', 'renewing'];

/** A certificate is settled once requested (`request_status: created`) and no longer transitional. */
export function certificatePhase(certificate: Record<string, unknown>): Phase {
  if (FAILED.includes(String(certificate.status))) return 'failed';
  if (certificate.request_status !== 'created') return 'pending';
  return phaseOf(certificate.status, { pending: TRANSITIONAL, failed: FAILED });
}
