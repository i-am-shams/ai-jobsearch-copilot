namespace JobCopilot.Contracts;

/// <summary>
/// Published by the worker when a match transitions Pending -> Processing,
/// right before the Gemini call - the transition that was previously written
/// to the database but never pushed anywhere, so the UI could show a status
/// pill it could never actually reach.
///
/// Deliberately a separate type and a separate queue from MatchCompletedEvent,
/// not reused: that event's own contract is documented as terminal-state-only
/// (Completed or Failed), and it travels on match-completed-fanout, which the
/// notifications service also subscribes to - publishing "Processing" there
/// would insert a spurious notification document for a match that hasn't
/// finished. match-processing is a direct queue, not a fanout exchange: today
/// there is exactly one subscriber (the API, for SignalR), and per this
/// project's own fanout-vs-queue lesson (see AGENTS.md), a fanout is only
/// worth it once a second subscriber actually needs the same event.
/// </summary>
public record MatchProcessingEvent(Guid ApplicationId, Guid UserId);
