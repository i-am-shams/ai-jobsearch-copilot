namespace JobCopilot.Contracts;

public record MatchCompletedEvent(Guid ApplicationId, Guid UserId, int MatchScore, string GapAnalysis);
