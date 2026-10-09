/**
 * Operations that duplicate another endpoint (same request, same response).
 * Tools call only the target; the coverage report counts the alias as covered
 * when its target is. Every entry needs a reason; tests check both IDs exist.
 */
export const OPERATION_ALIASES: Record<string, { target: string; reason: string }> = {
  'organizations.servers.sites.domains.certificate.show': {
    target: 'organizations.servers.sites.domains.certificates.active',
    reason: 'GET .../domains/{domain}/certificate and .../certificates/active both return the active certificate.',
  },
};
