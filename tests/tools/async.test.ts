import { describe, expect, it, vi } from 'vitest';
import { ForgeApiError } from '../../src/forge/errors.js';
import { POLL_INTERVAL_MS, orGone, outcome, phaseOf, waitFor } from '../../src/tools/shared/async.js';

const context = () => ({ sleep: vi.fn(async () => {}), progress: vi.fn(async () => {}) });

describe('phaseOf', () => {
  it('treats listed pending values as pending and anything else as completed', () => {
    const lists = { pending: ['creating', 'installing'], failed: ['failed'] };
    expect(phaseOf('creating', lists)).toBe('pending');
    expect(phaseOf('failed', lists)).toBe('failed');
    expect(phaseOf('installed', lists)).toBe('completed');
    expect(phaseOf('something-new', lists)).toBe('completed');
  });

  it('with a completed list, only those values complete', () => {
    const lists = { completed: ['finished'], failed: ['failed'] };
    expect(phaseOf('finished', lists)).toBe('completed');
    expect(phaseOf('queued', lists)).toBe('pending');
    expect(phaseOf(null, lists)).toBe('pending');
  });
});

describe('waitFor', () => {
  it('polls until the phase is final, reporting progress', async () => {
    const ctx = context();
    const poll = vi.fn().mockResolvedValueOnce('installing').mockResolvedValueOnce('installed');
    const result = await waitFor({
      initial: 'creating',
      poll,
      phase: (status) => phaseOf(status, { pending: ['creating', 'installing'] }),
      describe: (status) => `Site is ${status}`,
      timeoutSeconds: 60,
      context: ctx,
    });

    expect(result).toEqual({ status: 'completed', value: 'installed' });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(ctx.sleep).toHaveBeenCalledWith(POLL_INTERVAL_MS);
    expect(ctx.progress.mock.calls).toEqual([
      [1, 12, 'Site is creating'],
      [2, 12, 'Site is installing'],
    ]);
  });

  it('reads the initial state when none is given', async () => {
    const poll = vi.fn().mockResolvedValue('done');
    const result = await waitFor({ poll, phase: () => 'completed', describe: String, timeoutSeconds: 10, context: context() });
    expect(result.status).toBe('completed');
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('reports failures', async () => {
    const result = await waitFor({
      initial: 'failed',
      poll: vi.fn(),
      phase: (status) => phaseOf(status, { failed: ['failed'] }),
      describe: String,
      timeoutSeconds: 10,
      context: context(),
    });
    expect(result.status).toBe('failed');
  });

  it('returns in_progress after the timeout', async () => {
    const poll = vi.fn().mockResolvedValue('creating');
    const result = await waitFor({ initial: 'creating', poll, phase: () => 'pending', describe: String, timeoutSeconds: 10, context: context() });
    expect(result).toEqual({ status: 'in_progress', value: 'creating' });
    expect(poll).toHaveBeenCalledTimes(2); // 10s / 5s
  });

  it('turns read errors into "queued" with a reason instead of failing', async () => {
    const poll = vi.fn().mockRejectedValue(new ForgeApiError(403, 'This action is unauthorized.', 'GET', '/x'));
    const result = await waitFor({ initial: 'creating', poll, phase: () => 'pending', describe: String, timeoutSeconds: 10, context: context() });
    expect(result).toMatchObject({ status: 'queued', value: 'creating', unfollowed: expect.stringContaining('unauthorized') });
  });

  it('rethrows cancellations and unexpected errors', async () => {
    const ctx = context();
    ctx.sleep.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(
      waitFor({ initial: 'creating', poll: vi.fn(), phase: () => 'pending', describe: String, timeoutSeconds: 10, context: ctx }),
    ).rejects.toThrow('aborted');
  });
});

describe('orGone', () => {
  it('returns null once the resource is gone', async () => {
    await expect(orGone(async () => 'still here')).resolves.toBe('still here');
    await expect(orGone(async () => Promise.reject(new ForgeApiError(404, 'Not found', 'GET', '/x')))).resolves.toBeNull();
    await expect(orGone(async () => Promise.reject(new ForgeApiError(500, 'Boom', 'GET', '/x')))).rejects.toThrow('Boom');
  });
});

describe('outcome', () => {
  const options = { action: 'create the site', checkWith: 'forge_get_site', timeoutSeconds: 60 };

  it.each([
    ['completed', 'Forge completed the request to create the site.'],
    ['failed', 'Forge could not create the site. Check forge_get_site for details.'],
    ['in_progress', 'Forge is still working on the request to create the site after 60s. Check the outcome later with forge_get_site.'],
  ] as const)('%s', (status, summary) => {
    expect(outcome({ status }, options)).toEqual({ structured: { status, check_with: 'forge_get_site' }, summary });
  });

  it('explains why a queued operation was not followed', () => {
    expect(outcome({ status: 'queued', unfollowed: 'could not follow the operation (403)' }, options).summary).toBe(
      'Forge accepted the request to create the site; it runs in the background, but the tool could not follow the operation (403). Check the outcome with forge_get_site.',
    );
  });
});
