namespace JobCopilot.Api.Models;

public class Application
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User? User { get; set; }

    public string JobTitle { get; set; } = string.Empty;
    public string CompanyName { get; set; } = string.Empty;
    public string ResumeText { get; set; } = string.Empty;
    public string JobDescriptionText { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public MatchResult? MatchResult { get; set; }
}
