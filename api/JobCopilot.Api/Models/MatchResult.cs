namespace JobCopilot.Api.Models;

public enum MatchStatus { Pending, Processing, Completed, Failed }

public class MatchResult
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }

    public MatchStatus Status { get; set; } = MatchStatus.Pending;
    public int? MatchScore { get; set; }          // 0-100
    public string? GapAnalysis { get; set; }       // AI-generated text
    public DateTime? CompletedAt { get; set; }
}
