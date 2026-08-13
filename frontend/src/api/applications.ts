import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import {
  applicationListSchema,
  applicationResponseSchema,
  type ApplicationResponse,
  type CreateApplicationRequest,
} from '../lib/schemas';

export const applicationKeys = {
  all: ['applications'] as const,
  detail: (id: string) => ['applications', id] as const,
};

export function useApplications() {
  return useQuery({
    queryKey: applicationKeys.all,
    queryFn: async () => {
      const res = await apiClient.get('/applications');
      return applicationListSchema.parse(res.data);
    },
  });
}

export function useApplication(id: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/applications/${id}`);
      return applicationResponseSchema.parse(res.data);
    },
    // The list endpoint already returns every field the detail endpoint does, so
    // navigating from a row the app is literally already displaying should not
    // show a spinner. Seed from the list cache and let it revalidate in the
    // background. Landing on the URL directly finds nothing cached and fetches
    // normally, which is the correct behaviour for that case.
    initialData: () =>
      queryClient
        .getQueryData<ApplicationResponse[]>(applicationKeys.all)
        ?.find((app) => app.id === id),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(applicationKeys.all)?.dataUpdatedAt,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApplicationRequest) => {
      const res = await apiClient.post('/applications', input);
      return applicationResponseSchema.parse(res.data);
    },
    onSuccess: (created) => {
      // Seed the new row straight into the cache rather than refetching the whole
      // list. The row comes back Pending; the SignalR push then patches it in
      // place when the worker finishes.
      queryClient.setQueryData<ApplicationResponse[]>(applicationKeys.all, (previous) =>
        previous ? [created, ...previous] : [created],
      );
    },
  });
}

/**
 * Applies a live MatchCompleted push to the cache.
 *
 * The old code called "refetch the entire list" on every push. That worked, but
 * it threw away the payload the server had just gone to the trouble of sending
 * and made a network round trip to re-learn what it already knew. Patching the
 * one row that changed is both cheaper and what the event-driven design was for.
 *
 * The payload is validated before being trusted: it arrives over a WebSocket,
 * not through the typed axios path, so it is the one place data can enter the
 * cache without having been parsed.
 */
export function applyMatchPush(queryClient: ReturnType<typeof useQueryClient>, push: MatchPush) {
  const patch = (app: ApplicationResponse): ApplicationResponse =>
    app.id !== push.applicationId
      ? app
      : {
          ...app,
          matchStatus: parseStatus(push.status, app.matchStatus),
          matchScore: push.matchScore,
          gapAnalysis: push.gapAnalysis,
          completedAt: push.completedAt,
        };

  queryClient.setQueryData<ApplicationResponse[]>(applicationKeys.all, (previous) =>
    previous?.map(patch),
  );
  queryClient.setQueryData<ApplicationResponse>(
    applicationKeys.detail(push.applicationId),
    (previous) => (previous ? patch(previous) : previous),
  );

  // No refetch here on purpose. The event carries the whole terminal state, so
  // the cache is already correct. An earlier version left completedAt out of the
  // payload and tried to fix it up with an invalidate - which quietly did not
  // work: the detail query seeds from the list cache, so it considered itself
  // fresh on mount and never refetched, and a finished match showed no analysis
  // time and no turnaround at all. Carrying the full state is the fix; the
  // refetch was only ever papering over an incomplete event.
}

export interface MatchPush {
  applicationId: string;
  status: string;
  matchScore: number | null;
  gapAnalysis: string | null;
  completedAt: string | null;
}

function parseStatus(
  status: string,
  fallback: ApplicationResponse['matchStatus'],
): ApplicationResponse['matchStatus'] {
  return status === 'Completed' || status === 'Failed' || status === 'Processing' || status === 'Pending'
    ? status
    : fallback;
}
