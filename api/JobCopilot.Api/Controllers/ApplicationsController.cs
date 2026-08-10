using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using JobCopilot.Api.Data;
using JobCopilot.Api.Messaging;
using JobCopilot.Api.Models;

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
        int? MatchScore);

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    [HttpPost]
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

        _publisher.PublishMatchRequested(new MatchRequestedEvent(application.Id));

        return Ok(new ApplicationResponse(
            application.Id, application.JobTitle, application.CompanyName,
            application.CreatedAt, matchResult.Status.ToString(), matchResult.MatchScore));
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
                a.MatchResult!.Status.ToString(), a.MatchResult.MatchScore))
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
            app.MatchResult!.Status.ToString(), app.MatchResult.MatchScore));
    }
}
