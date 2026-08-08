import type { ApplicationResponse } from '../types/application';

interface Props {
  applications: ApplicationResponse[];
  loading: boolean;
}

export function ApplicationList({ applications, loading }: Props) {
  if (loading) return <p>Loading...</p>;
  if (applications.length === 0) return <p>No applications tracked yet.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Job Title</th>
          <th>Company</th>
          <th>Status</th>
          <th>Score</th>
          <th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        {applications.map((app) => (
          <tr key={app.id}>
            <td>{app.jobTitle}</td>
            <td>{app.companyName}</td>
            <td>{app.matchStatus}</td>
            <td>{app.matchScore ?? '—'}</td>
            <td>{new Date(app.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
