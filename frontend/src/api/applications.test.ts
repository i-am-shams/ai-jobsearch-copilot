import { describe, it, expect } from 'vitest';
import { applicationKeys, applyMatchPush } from './applications';
import { applicationResponseSchema } from '../lib/schemas';
import { makeQueryClient, anApplication } from '../test/render';
import type { ApplicationResponse } from '../lib/schemas';

describe('applyMatchPush', () => {
  it('patches only the row the push is about', () => {
    const queryClient = makeQueryClient();
    const a = anApplication({ id: 'a', matchStatus: 'Pending', matchScore: null, gapAnalysis: null });
    const b = anApplication({ id: 'b', matchStatus: 'Pending', matchScore: null, gapAnalysis: null });
    queryClient.setQueryData(applicationKeys.all, [a, b]);

    applyMatchPush(queryClient, {
      applicationId: 'a',
      status: 'Completed',
      matchScore: 88,
      gapAnalysis: 'Solid overlap.',
      completedAt: '2026-08-13T05:00:08Z',
    });

    const [updatedA, updatedB] = queryClient.getQueryData<ApplicationResponse[]>(applicationKeys.all)!;
    expect(updatedA).toMatchObject({ matchStatus: 'Completed', matchScore: 88, gapAnalysis: 'Solid overlap.' });
    expect(updatedB).toMatchObject({ matchStatus: 'Pending', matchScore: null, gapAnalysis: null });
  });

  it('applies a Failed push', () => {
    // Failed matches used to push nothing at all, so the row sat on "Analysing"
    // forever. Now they push with null score and analysis.
    const queryClient = makeQueryClient();
    queryClient.setQueryData(applicationKeys.all, [
      anApplication({ id: 'a', matchStatus: 'Processing', matchScore: null, gapAnalysis: null }),
    ]);

    applyMatchPush(queryClient, {
      applicationId: 'a',
      status: 'Failed',
      matchScore: null,
      gapAnalysis: null,
      completedAt: '2026-08-13T05:00:08Z',
    });

    expect(queryClient.getQueryData<ApplicationResponse[]>(applicationKeys.all)![0]).toMatchObject({
      matchStatus: 'Failed',
      matchScore: null,
    });
  });

  it('carries completedAt through, so the detail view can show a turnaround', () => {
    // Regression guard. The push originally omitted completedAt and tried to
    // repair the gap with an invalidate, which silently did nothing: the detail
    // query seeds from the list cache and considered itself fresh, so a finished
    // match showed "—" for both its analysis time and its turnaround.
    const queryClient = makeQueryClient();
    queryClient.setQueryData(applicationKeys.all, [
      anApplication({ id: 'a', matchStatus: 'Pending', matchScore: null, gapAnalysis: null, completedAt: null }),
    ]);

    applyMatchPush(queryClient, {
      applicationId: 'a',
      status: 'Completed',
      matchScore: 88,
      gapAnalysis: 'Solid overlap.',
      completedAt: '2026-08-13T05:00:08Z',
    });

    expect(queryClient.getQueryData<ApplicationResponse[]>(applicationKeys.all)![0].completedAt)
      .toBe('2026-08-13T05:00:08Z');
  });

  it('ignores an unrecognised status rather than corrupting the row', () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(applicationKeys.all, [anApplication({ id: 'a', matchStatus: 'Processing' })]);

    applyMatchPush(queryClient, {
      applicationId: 'a',
      status: 'SomethingNew',
      matchScore: 50,
      gapAnalysis: 'x',
      completedAt: null,
    });

    expect(queryClient.getQueryData<ApplicationResponse[]>(applicationKeys.all)![0].matchStatus)
      .toBe('Processing');
  });

  it('does nothing when the list has not been fetched yet', () => {
    const queryClient = makeQueryClient();
    expect(() =>
      applyMatchPush(queryClient, { applicationId: 'a', status: 'Completed', matchScore: 1, gapAnalysis: null, completedAt: null }),
    ).not.toThrow();
  });
});

describe('applicationResponseSchema', () => {
  it('rejects a response missing a field the UI depends on', () => {
    // This is the guard against the class of bug this whole session was about:
    // if the API silently stops returning gapAnalysis or completedAt, the app
    // should fail loudly rather than render blanks forever.
    const { gapAnalysis: _gapAnalysis, ...withoutAnalysis } = anApplication();
    expect(applicationResponseSchema.safeParse(withoutAnalysis).success).toBe(false);

    const { completedAt: _completedAt, ...withoutCompletedAt } = anApplication();
    expect(applicationResponseSchema.safeParse(withoutCompletedAt).success).toBe(false);
  });

  it('accepts nulls for a match that has not run yet', () => {
    const pending = anApplication({
      matchStatus: 'Pending',
      matchScore: null,
      gapAnalysis: null,
      completedAt: null,
    });
    expect(applicationResponseSchema.safeParse(pending).success).toBe(true);
  });

  it('rejects a status the UI has no rendering for', () => {
    expect(
      applicationResponseSchema.safeParse({ ...anApplication(), matchStatus: 'Cancelled' }).success,
    ).toBe(false);
  });
});
