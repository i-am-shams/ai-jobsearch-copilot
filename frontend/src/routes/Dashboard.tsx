import { useApplications } from '../api/applications';
import { toErrorMessage } from '../api/errors';
import { ApplicationForm } from '../components/ApplicationForm';
import { ApplicationList } from '../components/ApplicationList';

export function Dashboard() {
  const { data, isPending, isError, error, refetch, isFetching } = useApplications();

  return (
    <>
      <ApplicationForm />
      <hr />

      <div className="list-header">
        <h3>Tracked applications</h3>
        {/* Background refetches used to be indistinguishable from nothing
            happening. This is quiet, but it is honest. */}
        {isFetching && !isPending && <span className="muted">Refreshing…</span>}
      </div>

      {isError ? (
        <div className="form-error" role="alert">
          <p>{toErrorMessage(error, 'Could not load your applications.')}</p>
          <button type="button" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <ApplicationList applications={data ?? []} loading={isPending} />
      )}
    </>
  );
}
