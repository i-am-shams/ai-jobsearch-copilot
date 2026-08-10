namespace JobCopilot.Contracts;

public record MatchCompletedEvent(Guid ApplicationId, int MatchScore, string GapAnalysis);
