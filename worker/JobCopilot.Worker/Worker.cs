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
        var factory = new ConnectionFactory
        {
            HostName = _config["RabbitMq:Host"] ?? "localhost",
            Port = int.Parse(_config["RabbitMq:Port"] ?? "5672"),
            UserName = _config["RabbitMq:Username"] ?? "jobcopilot",
            Password = _config["RabbitMq:Password"] ?? "devpassword"
        };

        // Retry with backoff: on a cold start (e.g. docker compose up from scratch),
        // RabbitMQ's healthcheck can report "healthy" slightly before its AMQP listener
        // is actually ready to accept connections (see Steps 23-26 findings). Connecting
        // eagerly with no retry meant a single failed attempt crashed the whole host.
        _connection = await ConnectWithRetryAsync(factory, stoppingToken);
        _channel = _connection.CreateModel();

        _channel.QueueDeclare("match-requests", durable: true, exclusive: false, autoDelete: false);
        _channel.QueueDeclare("match-completed", durable: true, exclusive: false, autoDelete: false);
        _channel.BasicQos(0, 1, false); // one message at a time

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
                // Nack, don't just log. With manual ack and BasicQos(prefetch: 1),
                // a message that is neither acked nor nacked stays outstanding forever,
                // and RabbitMQ will not deliver the next one - a single unexpected
                // failure here silently stops the worker consuming anything at all,
                // permanently. It looks perfectly healthy while doing so: the process
                // is alive and the AMQP connection is open, so even the connection-gated
                // heartbeat below keeps reporting healthy.
                //
                // requeue: false is deliberate. Requeuing sends the same poison message
                // straight back to the only consumer, which fails on it again in a tight
                // loop. Dropping it costs one match; requeuing costs every future match.
                // A dead-letter queue is the real answer and is listed as a known gap.
                _logger.LogError(ex, "Error processing message - dropping it (not requeued)");
                try
                {
                    _channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
                }
                catch (Exception nackEx)
                {
                    _logger.LogError(nackEx, "Failed to nack message");
                }
            }
        };

        _channel.BasicConsume("match-requests", autoAck: false, consumer);
        _logger.LogInformation("Worker started and listening for match requests");

        await RunHeartbeatLoopAsync(stoppingToken);
    }

    /// <summary>
    /// Writes a heartbeat file that the container healthcheck reads the mtime of.
    ///
    /// The worker has no HTTP surface, so there is no /health endpoint to poll -
    /// a file's freshness is the cheapest honest liveness signal available, and
    /// needs no extra tooling in the runtime image (the aspnet:8.0 image has no
    /// curl/wget, but does have stat/date).
    ///
    /// Deliberately gated on the AMQP connection AND channel still being open:
    /// a worker whose process is alive but has silently lost its RabbitMQ
    /// connection consumes nothing at all, yet a plain "is the process running"
    /// check would report it perfectly healthy - exactly the failure this is
    /// meant to catch.
    /// </summary>
    private async Task RunHeartbeatLoopAsync(CancellationToken stoppingToken)
    {
        var heartbeatPath = _config["Worker:HeartbeatFile"]
            ?? Path.Combine(Path.GetTempPath(), "worker-heartbeat");

        _logger.LogInformation("Writing liveness heartbeat to {Path}", heartbeatPath);

        while (!stoppingToken.IsCancellationRequested)
        {
            if (_connection is { IsOpen: true } && _channel is { IsOpen: true })
            {
                try
                {
                    File.WriteAllText(heartbeatPath, DateTimeOffset.UtcNow.ToString("O"));
                }
                catch (Exception ex)
                {
                    // Never let a heartbeat-write failure take down the worker -
                    // going stale (and so unhealthy) is the correct signal here.
                    _logger.LogWarning(ex, "Failed to write heartbeat file {Path}", heartbeatPath);
                }
            }
            else
            {
                _logger.LogWarning(
                    "RabbitMQ connection or channel is closed - skipping heartbeat write");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }

    private async Task<IConnection> ConnectWithRetryAsync(
        ConnectionFactory factory, CancellationToken stoppingToken, int maxAttempts = 10)
    {
        var delay = TimeSpan.FromSeconds(2);
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return factory.CreateConnection();
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                _logger.LogWarning(
                    "RabbitMQ connection attempt {Attempt}/{Max} failed: {Message}. Retrying in {Delay}s...",
                    attempt, maxAttempts, ex.Message, delay.TotalSeconds);
                await Task.Delay(delay, stoppingToken);
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 30));
            }
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
            PublishCompleted(new MatchCompletedEvent(
                app.Id, app.UserId, nameof(MatchStatus.Completed), score, gapAnalysis));
        }
        catch (Exception ex)
        {
            app.MatchResult.Status = MatchStatus.Failed;
            _logger.LogError(ex, "Failed to process match for application {AppId}", evt.ApplicationId);
            await db.SaveChangesAsync();

            // Publish on failure too. Previously this path saved "Failed" and stopped,
            // so the browser was never told: the row stayed on "Analysing" indefinitely
            // and the only trace of the failure was in these logs. A user cannot act on
            // a status they are never shown.
            PublishCompleted(new MatchCompletedEvent(
                app.Id, app.UserId, nameof(MatchStatus.Failed), null, null));
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
