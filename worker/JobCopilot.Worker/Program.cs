using JobCopilot.Worker;
using JobCopilot.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Http;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddHttpClient<GeminiMatchingService>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
