using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using JobCopilot.Api.Data;
using JobCopilot.Api.Models;

namespace JobCopilot.Api.Controllers;

[ApiController]
[Route("api/applications")]
[Authorize]
public class ApplicationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public ApplicationsController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
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

    private Guid GetCurrentUserId()
    {
        // Try to get from User claims first
        var subClaim = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        
        // If not found, try to parse the token directly
        if (string.IsNullOrEmpty(subClaim))
        {
            var authHeader = Request.Headers.Authorization.ToString();
            if (authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring("Bearer ".Length);
                var handler = new JwtSecurityTokenHandler();
                try
                {
                    var jwtToken = handler.ReadToken(token) as JwtSecurityToken;
                    subClaim = jwtToken?.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;
                }
                catch { }
            }
        }
        
        if (string.IsNullOrEmpty(subClaim))
            throw new UnauthorizedAccessException("Sub claim not found in token");
        
        return Guid.Parse(subClaim);
    }

    [HttpPost]
    public async Task<ActionResult<ApplicationResponse>> Create(CreateApplicationRequest req)
    {
        var userId = GetCurrentUserId();
        var application = new Application
        {
            UserId = userId,
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

        return Ok(new ApplicationResponse(
            application.Id, application.JobTitle, application.CompanyName,
            application.CreatedAt, matchResult.Status.ToString(), matchResult.MatchScore));
    }

    [HttpGet]
    public async Task<ActionResult<List<ApplicationResponse>>> List()
    {
        var userId = GetCurrentUserId();
        var apps = await _db.Applications
            .Where(a => a.UserId == userId)
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
        var userId = GetCurrentUserId();
        var app = await _db.Applications
            .Include(a => a.MatchResult)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);

        if (app is null) return NotFound();

        return Ok(new ApplicationResponse(
            app.Id, app.JobTitle, app.CompanyName, app.CreatedAt,
            app.MatchResult!.Status.ToString(), app.MatchResult.MatchScore));
    }
}
