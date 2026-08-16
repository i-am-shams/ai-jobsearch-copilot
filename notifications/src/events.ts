// Mirrors api/JobCopilot.Contracts/Messaging/MatchCompletedEvent.cs exactly.
// The worker serializes with System.Text.Json's default naming policy, which
// is PascalCase (no camelCase conversion configured on that call) - the field
// names below have to match the C# record's property names verbatim, not the
// camelCase convention the REST API uses elsewhere.
export interface MatchCompletedEvent {
  ApplicationId: string;
  UserId: string;
  Status: 'Completed' | 'Failed';
  MatchScore: number | null;
  GapAnalysis: string | null;
  CompletedAt: string | null;
}

export function isMatchCompletedEvent(value: unknown): value is MatchCompletedEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ApplicationId === 'string' &&
    typeof v.UserId === 'string' &&
    (v.Status === 'Completed' || v.Status === 'Failed')
  );
}
