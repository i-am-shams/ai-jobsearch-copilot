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

        // Dead-letter setup: a nacked (requeue: false) message is routed here by
        // RabbitMQ automatically once the queue carries x-dead-letter-exchange -
        // no change needed to the nack call itself. Must match
        // RabbitMqPublisher.cs's declaration of the same queue exactly, since both
        // the publisher and this consumer declare match-requests.
        _channel.ExchangeDeclare("match-requests.dlx", ExchangeType.Fanout, durable: true);
        _channel.QueueDeclare("match-requests.dlq", durable: true, exclusive: false, autoDelete: false);
        _channel.QueueBind("match-requests.dlq", "match-requests.dlx", routingKey: "");
        _channel.QueueDeclare("match-requests", durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object> { { "x-dead-letter-exchange", "match-requests.dlx" } });

        // See MatchProcessingEvent.cs for why this is a separate direct queue, not
        // the match-completed-fanout exchange. Must match MatchCompletedConsumer.cs's
        // declaration of the same queue exactly.
        _channel.ExchangeDeclare("match-processing.dlx", ExchangeType.Fanout, durable: true);
        _channel.QueueDeclare("match-processing.dlq", durable: true, exclusive: false, autoDelete: false);
        _channel.QueueBind("match-processing.dlq", "match-processing.dlx", routingKey: "");
        _channel.QueueDeclare("match-processing", durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object> { { "x-dead-letter-exchange", "match-processing.dlx" } });

        // MatchCompletedEvent has more than one independent subscriber (the API, for
        // SignalR, and - as of Project 2 - the notifications service), so this is a
        // fanout exchange rather than a direct-to-queue publish. Each subscriber
        // declares and binds its own durable queue (see MatchCompletedConsumer.cs and
        // the notifications service) so every subscriber gets every message,
        // independently. A direct-to-queue publish here would have RabbitMQ
        // round-robin deliveries between whichever consumers happened to be bound to
        // the same queue - silently dropping roughly half of them for each.
        _channel.ExchangeDeclare("match-completed-fanout", ExchangeType.Fanout, durable: true);
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
                // loop. RabbitMQ routes a nacked, non-requeued message to
                // match-requests.dlx (declared above) automatically - it isn't lost,
                // it's parked in match-requests.dlq for inspection/replay.
                _logger.LogError(ex, "Error processing message - dead-lettering it (not requeued)");
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
        // Previously this transition was written to the database and nothing else -
        // the UI could show "Analysing" but could never actually be pushed into it.
        PublishProcessing(new MatchProcessingEvent(app.Id, app.UserId));

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
                app.Id, app.UserId, nameof(MatchStatus.Completed), score, gapAnalysis,
                app.MatchResult.CompletedAt));
        }
        catch (Exception ex)
        {
            app.MatchResult.Status = MatchStatus.Failed;
            // Stamp the terminal time on failure too. It was previously set only on
            // success, so a failed match had no record of when it stopped - and the
            // client had no way to tell a match that failed a second ago from one
            // that failed last week.
            app.MatchResult.CompletedAt = DateTime.UtcNow;
            _logger.LogError(ex, "Failed to process match for application {AppId}", evt.ApplicationId);
            await db.SaveChangesAsync();

            // Publish on failure too. Previously this path saved "Failed" and stopped,
            // so the browser was never told: the row stayed on "Analysing" indefinitely
            // and the only trace of the failure was in these logs. A user cannot act on
            // a status they are never shown.
            PublishCompleted(new MatchCompletedEvent(
                app.Id, app.UserId, nameof(MatchStatus.Failed), null, null,
                app.MatchResult.CompletedAt));
        }
    }

    private void PublishProcessing(MatchProcessingEvent evt)
    {
        var json = JsonSerializer.Serialize(evt);
        var body = Encoding.UTF8.GetBytes(json);
        var props = _channel!.CreateBasicProperties();
        props.Persistent = true;
        _channel.BasicPublish("", "match-processing", props, body);
    }

    private void PublishCompleted(MatchCompletedEvent evt)
    {
        var json = JsonSerializer.Serialize(evt);
        var body = Encoding.UTF8.GetBytes(json);
        var props = _channel!.CreateBasicProperties();
        props.Persistent = true;
        // Fanout ignores the routing key - every bound queue gets a copy.
        _channel.BasicPublish("match-completed-fanout", "", props, body);
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
        base.Dispose();
    }
}
