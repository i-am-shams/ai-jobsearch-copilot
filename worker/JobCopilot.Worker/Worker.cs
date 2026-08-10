using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using JobCopilot.Contracts;

namespace JobCopilot.Worker;

public class Worker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<Worker> _logger;
    private IConnection? _connection;
    private IModel? _channel;

    public Worker(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<Worker> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            _logger.LogInformation("ExecuteAsync: Starting worker setup");
            
            var factory = new ConnectionFactory
            {
                HostName = _config["RabbitMq:Host"] ?? "localhost",
                Port = int.Parse(_config["RabbitMq:Port"] ?? "5672"),
                UserName = _config["RabbitMq:Username"] ?? "jobcopilot",
                Password = _config["RabbitMq:Password"] ?? "devpassword"
            };
            _logger.LogInformation("ExecuteAsync: Creating RabbitMQ connection");
            _connection = factory.CreateConnection();
            _logger.LogInformation("ExecuteAsync: Connection established");
            
            _channel = _connection.CreateModel();
            _logger.LogInformation("ExecuteAsync: Channel created");
            
            _channel.QueueDeclare("match-requests", durable: true, exclusive: false, autoDelete: false);
            _channel.QueueDeclare("match-completed", durable: true, exclusive: false, autoDelete: false);
            _logger.LogInformation("ExecuteAsync: Queue declared");
            
            _channel.BasicQos(0, 1, false); // one message at a time
            _logger.LogInformation("ExecuteAsync: QoS set");

            var consumer = new EventingBasicConsumer(_channel);
            consumer.Received += async (_, ea) =>
            {
                try
                {
                    var json = Encoding.UTF8.GetString(ea.Body.ToArray());
                    var evt = JsonSerializer.Deserialize<MatchRequestedEvent>(json)!;
                    await ProcessMatch(evt);
                    _channel.BasicAck(ea.DeliveryTag, multiple: false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing message");
                }
            };

            _channel.BasicConsume("match-requests", autoAck: false, consumer);
            _logger.LogInformation("Worker started and listening for match requests");
            
            // Keep the service running until cancellation is requested
            _logger.LogInformation("ExecuteAsync: Waiting for stop signal");
            await Task.Delay(Timeout.Infinite, stoppingToken);
            _logger.LogInformation("ExecuteAsync: Received stop signal");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Critical error in ExecuteAsync");
            throw;
        }
    }

    private async Task ProcessMatch(MatchRequestedEvent evt)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var gemini = scope.ServiceProvider.GetRequiredService<GeminiMatchingService>();

        var app = await db.Applications.Include(a => a.MatchResult)
            .FirstOrDefaultAsync(a => a.Id == evt.ApplicationId);
        if (app?.MatchResult is null) 
        {
            _logger.LogWarning("Application {AppId} not found or has no MatchResult", evt.ApplicationId);
            return;
        }

        _logger.LogInformation("Processing match for application {AppId}", evt.ApplicationId);

        app.MatchResult.Status = MatchStatus.Processing;
        await db.SaveChangesAsync();

        try
        {
            var (score, gapAnalysis) = await gemini.ScoreMatch(app.ResumeText, app.JobDescriptionText);
            app.MatchResult.Status = MatchStatus.Completed;
            app.MatchResult.MatchScore = score;
            app.MatchResult.GapAnalysis = gapAnalysis;
            app.MatchResult.CompletedAt = DateTime.UtcNow;
            _logger.LogInformation("Match completed for application {AppId}: score={Score}", evt.ApplicationId, score);
            
            await db.SaveChangesAsync();
            PublishCompleted(new MatchCompletedEvent(app.Id, app.UserId, score, gapAnalysis));
        }
        catch (Exception ex)
        {
            app.MatchResult.Status = MatchStatus.Failed;
            _logger.LogError(ex, "Failed to process match for application {AppId}", evt.ApplicationId);
            await db.SaveChangesAsync();
        }
    }

    private void PublishCompleted(MatchCompletedEvent evt)
    {
        var json = JsonSerializer.Serialize(evt);
        var body = Encoding.UTF8.GetBytes(json);
        var props = _channel!.CreateBasicProperties();
        props.Persistent = true;
        _channel.BasicPublish("", "match-completed", props, body);
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
        base.Dispose();
    }
}
