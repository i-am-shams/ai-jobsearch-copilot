using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using JobCopilot.Contracts;
using JobCopilot.Api.Messaging;

namespace JobCopilot.Api.Controllers;

[ApiController]
[Route("api/applications")]
[Authorize]
public class ApplicationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMessagePublisher _publisher;

    public ApplicationsController(AppDbContext db, IMessagePublisher publisher)
    {
        _db = db;
        _publisher = publisher;
    }

    public record CreateApplicationRequest(
        string JobTitle,
        string CompanyName,
        string ResumeText,
        string JobDescriptionText);

    public record ApplicationResponse(
        Guid Id,
        string JobTitle,
        string CompanyName,
        DateTime CreatedAt,
        string MatchStatus,
        int? MatchScore,
        string? GapAnalysis,
        // The worker has always stamped MatchResult.CompletedAt, but nothing ever
        // returned it, so how long a match actually took was invisible outside the
        // database - the same "generated, stored, never surfaced" pattern as the
        // gap analysis itself. Paired with CreatedAt it gives the real pipeline
        // turnaround time, which is the interesting number for an async system.
        DateTime? CompletedAt);

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    [HttpPost]
    [EnableRateLimiting("applications")]
    public async Task<ActionResult<ApplicationResponse>> Create(CreateApplicationRequest req)
    {
        var application = new Application
        {
            UserId = CurrentUserId,
            JobTitle = req.JobTitle,
            CompanyName = req.CompanyName,
            ResumeText = req.ResumeText,
            JobDescriptionText = req.JobDescriptionText
        };

        // Placeholder MatchResult row — status Pending until Week 2's worker processes it
        var matchResult = new MatchResult
        {
            ApplicationId = application.Id,
            Status = MatchStatus.Pending
        };

        _db.Applications.Add(application);
        _db.MatchResults.Add(matchResult);
        await _db.SaveChangesAsync();

        // Publish message to RabbitMQ queue for worker processing
        _publisher.PublishMatchRequested(new MatchRequestedEvent(application.Id));

        return Ok(new ApplicationResponse(
            application.Id, application.JobTitle, application.CompanyName,
            application.CreatedAt, matchResult.Status.ToString(), matchResult.MatchScore,
            matchResult.GapAnalysis, matchResult.CompletedAt));
    }

    [HttpGet]
    public async Task<ActionResult<List<ApplicationResponse>>> List()
    {
        var apps = await _db.Applications
            .Where(a => a.UserId == CurrentUserId)
            .Include(a => a.MatchResult)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new ApplicationResponse(
                a.Id, a.JobTitle, a.CompanyName, a.CreatedAt,
                a.MatchResult!.Status.ToString(), a.MatchResult.MatchScore,
                a.MatchResult.GapAnalysis, a.MatchResult.CompletedAt))
            .ToListAsync();

        return Ok(apps);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ApplicationResponse>> GetById(Guid id)
    {
        var app = await _db.Applications
            .Include(a => a.MatchResult)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == CurrentUserId);

        if (app is null) return NotFound();

        return Ok(new ApplicationResponse(
            app.Id, app.JobTitle, app.CompanyName, app.CreatedAt,
            app.MatchResult!.Status.ToString(), app.MatchResult.MatchScore,
            app.MatchResult.GapAnalysis, app.MatchResult.CompletedAt));
    }
}
