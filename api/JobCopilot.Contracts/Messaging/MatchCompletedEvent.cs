namespace JobCopilot.Contracts;

/// <summary>
/// Published by the worker when a match reaches a terminal state - Completed OR
/// Failed. Originally it was published on success only, which meant a failed match
/// never pushed anything to the browser: the row sat on "Analysing" until the user
/// manually refreshed, with the failure visible only in the worker's logs.
///
/// Score and analysis are nullable because a failed match genuinely has neither.
/// The queue and the SignalR method are still named "match-completed"/"MatchCompleted"
/// rather than something more accurate like "finished" - renaming the queue would
/// strand any messages already durably sitting in the old one on a live deployment,
/// which isn't worth it for a naming improvement.
/// </summary>
public record MatchCompletedEvent(
    Guid ApplicationId,
    Guid UserId,
    string Status,
    int? MatchScore,
    string? GapAnalysis);
