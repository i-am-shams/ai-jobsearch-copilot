import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import type { ApplicationResponse } from '../types/application';
import { StatusPill } from './StatusPill';
import { AnimatedScore } from './AnimatedScore';

interface Props {
  applications: ApplicationResponse[];
  loading: boolean;
}

export function ApplicationList({ applications, loading }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState<ReadonlySet<string>>(new Set());
  const previousStatus = useRef(new Map<string, string>());

  // Track which rows have *just* flipped to Completed, so the score can count
  // up and the row can flash. Comparing against the previous render is what
  // distinguishes "this result arrived live over SignalR" from "this row was
  // already finished when the page loaded" - only the former should animate.
  useEffect(() => {
    const newlyCompleted = applications
      .filter((app) => {
        const previous = previousStatus.current.get(app.id);
        return previous !== undefined && previous !== app.matchStatus && app.matchStatus === 'Completed';
      })
      .map((app) => app.id);

    applications.forEach((app) => previousStatus.current.set(app.id, app.matchStatus));

    if (newlyCompleted.length === 0) return;

    setJustCompleted(new Set(newlyCompleted));
    const timer = setTimeout(() => setJustCompleted(new Set()), 2500);
    return () => clearTimeout(timer);
  }, [applications]);

  // Only show the loading placeholder on the very first load. Later refetches
  // are triggered by live updates, and blanking the table on every push would
  // make it flicker for no reason.
  if (loading && applications.length === 0) {
    return <p className="muted">Loading…</p>;
  }

  if (applications.length === 0) {
    return <p className="muted">No applications tracked yet. Add one above to get a match score.</p>;
  }

  return (
    <table className="applications">
      <thead>
        <tr>
          <th scope="col">Job Title</th>
          <th scope="col">Company</th>
          <th scope="col">Status</th>
          <th scope="col" className="numeric">Score</th>
          <th scope="col">Submitted</th>
          <th scope="col"><span className="sr-only">Details</span></th>
        </tr>
      </thead>
      <tbody>
        {applications.map((app) => {
          const isExpanded = expandedId === app.id;
          const hasAnalysis = Boolean(app.gapAnalysis);
          const isFresh = justCompleted.has(app.id);

          return (
            <Fragment key={app.id}>
              <tr className={isFresh ? 'row row--fresh' : 'row'}>
                <td>
                  {hasAnalysis ? (
                    <button
                      type="button"
                      className="disclosure"
                      aria-expanded={isExpanded}
                      aria-controls={`analysis-${app.id}`}
                      onClick={() => setExpandedId(isExpanded ? null : app.id)}
                    >
                      <span className="disclosure__marker" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      {app.jobTitle}
                    </button>
                  ) : (
                    <span className="disclosure disclosure--empty">{app.jobTitle}</span>
                  )}
                </td>
                <td>{app.companyName}</td>
                <td>
                  <StatusPill status={app.matchStatus} />
                </td>
                <td className="numeric">
                  {app.matchScore === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="score">
                      <AnimatedScore value={app.matchScore} animate={isFresh} />
                    </span>
                  )}
                </td>
                <td>{new Date(app.createdAt).toLocaleDateString()}</td>
                <td>
                  {/* The row expands inline for a quick look; this goes to the
                      full record, including the pipeline turnaround time that
                      the table has no room for. */}
                  <Link to={`/applications/${app.id}`} className="row-link" aria-label={`View details for ${app.jobTitle}`}>
                    Details
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </td>
              </tr>

              {isExpanded && hasAnalysis && (
                <tr id={`analysis-${app.id}`} className="analysis">
                  <td colSpan={6}>
                    <h4>Gap analysis</h4>
                    <p>{app.gapAnalysis}</p>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
