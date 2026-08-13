using System.IdentityModel.Tokens.Jwt;
using System.Threading.RateLimiting;
using JobCopilot.Api.HealthChecks;
using JobCopilot.Api.Hubs;
using JobCopilot.Api.Messaging;
using JobCopilot.Api.Services;
using JobCopilot.Contracts;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("Default"),
        b => b.MigrationsAssembly("JobCopilot.Api")));

builder.Services.AddScoped<AuthService>();

builder.Services.AddSingleton<IMessagePublisher, RabbitMqPublisher>();

builder.Services.AddSignalR();
builder.Services.AddHostedService<MatchCompletedConsumer>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Preserve original JWT claim names (e.g. "sub") instead of ASP.NET Core's
        // default remapping to legacy long-form XML claim types.
        options.MapInboundClaims = false;
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };

        // SignalR's WebSocket and Server-Sent-Events transports cannot carry an
        // Authorization header - the browser APIs behind them (WebSocket, EventSource)
        // simply don't allow setting one. The SignalR JS client therefore passes the
        // token as an "access_token" query parameter for those two transports only.
        // Without reading it here, [Authorize] on MatchHub rejects both handshakes with
        // a 401 and the client silently falls back to long polling. That still *works*,
        // which is exactly why this went unnoticed: real-time updates arrived, just over
        // the slowest transport after two failed handshakes and three re-negotiates.
        // Scoped to /hubs so a query-string token is never accepted on the REST API,
        // where it would leak into logs and browser history.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) &&
                    context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:5174")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Health checks. Split deliberately into liveness vs readiness (see the two
// endpoint mappings below) - conflating them is a common mistake that makes a
// transient dependency blip kill and restart an otherwise-fine container.
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>("postgres", tags: new[] { "ready" })
    .AddCheck<RabbitMqHealthCheck>("rabbitmq", tags: new[] { "ready" });

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Rate limiting: protects against abuse, and specifically against runaway costs on
// /api/applications, where every request triggers a real, metered downstream Gemini
// API call via the async pipeline. Fixed-window per-client (IP-based) limiting -
// simple and sufficient at this project's scale; a distributed limiter (e.g. Redis-backed)
// would be the next step if this ran behind multiple API instances.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddFixedWindowLimiter("applications", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });

    options.AddFixedWindowLimiter("auth", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });
});

var app = builder.Build();

// Apply pending migrations automatically on startup. Without host network
// access to Postgres (deliberately removed - see docker-compose.yml), there's
// no separate manual "dotnet ef database update" step available against a
// fresh container, and no separate migration step exists in the CD pipeline
// yet either. Auto-migrating is the standard, appropriate pattern for a
// single-instance deployment; the known caveat (multiple instances racing to
// apply the same migration concurrently) doesn't apply here since this
// project runs exactly one API instance.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("FrontendDev");

app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<MatchHub>("/hubs/match");

// Liveness: "is this process up and serving HTTP?" Runs NO dependency checks
// (Predicate = _ => false). This is what Docker's healthcheck and the external
// uptime monitor hit - a Postgres blip should not cause Docker to kill and
// restart an API container that is itself perfectly fine and would recover.
app.MapHealthChecks("/health", new HealthCheckOptions
{
    Predicate = _ => false
});

// Readiness: "can this API actually do its job?" - Postgres reachable and
// RabbitMQ accepting connections. Left with the default plain-text response
// ("Healthy"/"Unhealthy") rather than a detailed JSON writer, because this is
// reachable unauthenticated over the public domain and per-dependency failure
// detail would leak internal topology to anyone who asks.
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

app.Run();
