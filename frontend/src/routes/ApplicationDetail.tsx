import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApplication } from '../api/applications';
import { toErrorMessage } from '../api/errors';
import { StatusPill } from '../components/StatusPill';
import { LoadingState } from '../components/StateMessage';

/**
 * Detail view for one application.
 *
 * This is also the first thing in the app to use GET /api/applications/{id},
 * which had existed and been user-scoped since Step 13 with no caller at all.
 */
export function ApplicationDetail() {
  const { id = '' } = useParams();
  const { data, isPending, isError, error } = useApplication(id);

  if (isPending) return <LoadingState />;

  if (isError) {
    return (
      <div className="form-error" role="alert">
        <p>{toErrorMessage(error, 'Could not load this application.')}</p>
        <Link to="/" className="back-link">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to all applications
        </Link>
      </div>
    );
  }

  const turnaround =
    data.completedAt !== null
      ? Math.max(0, (new Date(data.completedAt).getTime() - new Date(data.createdAt).getTime()) / 1000)
      : null;

  return (
    <article className="detail">
      <p>
        <Link to="/" className="back-link">
          <ArrowLeft size={14} aria-hidden="true" />
          All applications
        </Link>
      </p>

      <h2>{data.jobTitle}</h2>
      <p className="muted">{data.companyName}</p>

      <dl className="detail__meta">
        <div>
          <dt>Status</dt>
          <dd><StatusPill status={data.matchStatus} /></dd>
        </div>
        <div>
          <dt>Match score</dt>
          <dd>{data.matchScore === null ? <span className="muted">—</span> : `${data.matchScore} / 100`}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{new Date(data.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Analysed</dt>
          <dd>
            {data.completedAt === null ? (
              <span className="muted">—</span>
            ) : (
              new Date(data.completedAt).toLocaleString()
            )}
          </dd>
        </div>
        <div>
          {/* completedAt was stamped by the worker and returned by nothing until
              this session. Against createdAt it is the honest measure of what the
              whole async pipeline actually costs end to end. */}
          <dt>Pipeline turnaround</dt>
          <dd>{turnaround === null ? <span className="muted">—</span> : `${turnaround.toFixed(1)}s`}</dd>
        </div>
      </dl>

      <h3>Gap analysis</h3>
      {data.gapAnalysis ? (
        <p className="detail__analysis">{data.gapAnalysis}</p>
      ) : data.matchStatus === 'Failed' ? (
        <p className="muted">
          This match could not be analysed. Submitting it again will retry it.
        </p>
      ) : (
        <p className="muted">Not analysed yet — this appears as soon as the worker finishes.</p>
      )}
    </article>
  );
}
