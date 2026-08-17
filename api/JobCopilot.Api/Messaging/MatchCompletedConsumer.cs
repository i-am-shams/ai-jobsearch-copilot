using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using Microsoft.AspNetCore.SignalR;
using JobCopilot.Contracts;
using JobCopilot.Api.Hubs;

namespace JobCopilot.Api.Messaging;

public class MatchCompletedConsumer : BackgroundService
{
    private readonly IHubContext<MatchHub> _hub;
    private readonly IConfiguration _config;
    private readonly ILogger<MatchCompletedConsumer> _logger;
    private IConnection? _connection;
    private IModel? _channel;

    public MatchCompletedConsumer(IHubContext<MatchHub> hub, IConfiguration config, ILogger<MatchCompletedConsumer> logger)
    {
        _hub = hub;
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

        // Retry with backoff: same cold-start resilience as Worker.cs's connection
        // logic - see that file for the full rationale.
        _connection = await ConnectWithRetryAsync(factory, stoppingToken);
        _channel = _connection.CreateModel();

        // MatchCompletedEvent now fans out to more than one independent subscriber
        // (this consumer, for SignalR, and - as of Project 2 - the notifications
        // service), so the worker publishes to a fanout exchange rather than
        // directly to a queue. This consumer owns its own durable queue, bound to
        // that exchange, so it keeps getting every message regardless of who else
        // is also subscribed - sharing one queue between independent consumers
        // would have RabbitMQ round-robin deliveries between them instead.
        _channel.ExchangeDeclare("match-completed-fanout", ExchangeType.Fanout, durable: true);

        // Dead-letter setup: a nacked (requeue: false) message routes here
        // automatically once the queue carries x-dead-letter-exchange - see
        // Worker.cs's match-requests.dlx for the identical pattern.
        _channel.ExchangeDeclare("match-completed-api.dlx", ExchangeType.Fanout, durable: true);
        _channel.QueueDeclare("match-completed-api.dlq", durable: true, exclusive: false, autoDelete: false);
        _channel.QueueBind("match-completed-api.dlq", "match-completed-api.dlx", routingKey: "");
        _channel.QueueDeclare("match-completed-api", durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object> { { "x-dead-letter-exchange", "match-completed-api.dlx" } });
        _channel.QueueBind("match-completed-api", "match-completed-fanout", routingKey: "");

        var consumer = new EventingBasicConsumer(_channel);
        consumer.Received += async (_, ea) =>
        {
            try
            {
                var json = Encoding.UTF8.GetString(ea.Body.ToArray());
                var evt = JsonSerializer.Deserialize<MatchCompletedEvent>(json)!;
                await NotifyUser(evt);
                _channel.BasicAck(ea.DeliveryTag, multiple: false);
            }
            catch (Exception ex)
            {
                // Nack rather than leaving the delivery outstanding forever - see the
                // equivalent handler in the worker for the full reasoning. No prefetch
                // limit is set on this channel, so an unacked message here stalls
                // nothing, but it does leak an unacked delivery that is only ever
                // released on reconnect. requeue: false for the same poison-message
                // reason as the worker; dead-lettered to match-completed-api.dlq
                // rather than lost.
                _logger.LogError(ex, "Error processing MatchCompletedEvent - dead-lettering it (not requeued)");
                try
                {
                    _channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
                }
                catch (Exception nackEx)
                {
                    _logger.LogError(nackEx, "Failed to nack MatchCompletedEvent");
                }
            }
        };
        _channel.BasicConsume("match-completed-api", autoAck: false, consumer);

        // Second, independent subscription on the same connection/channel: see
        // MatchProcessingEvent.cs for why this is its own direct queue rather than
        // folded into match-completed-fanout above.
        _channel.ExchangeDeclare("match-processing.dlx", ExchangeType.Fanout, durable: true);
        _channel.QueueDeclare("match-processing.dlq", durable: true, exclusive: false, autoDelete: false);
        _channel.QueueBind("match-processing.dlq", "match-processing.dlx", routingKey: "");
        _channel.QueueDeclare("match-processing", durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object> { { "x-dead-letter-exchange", "match-processing.dlx" } });

        var processingConsumer = new EventingBasicConsumer(_channel);
        processingConsumer.Received += async (_, ea) =>
        {
            try
            {
                var json = Encoding.UTF8.GetString(ea.Body.ToArray());
                var evt = JsonSerializer.Deserialize<MatchProcessingEvent>(json)!;
                await NotifyProcessing(evt);
                _channel.BasicAck(ea.DeliveryTag, multiple: false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing MatchProcessingEvent - dead-lettering it (not requeued)");
                try
                {
                    _channel.BasicNack(ea.DeliveryTag, multiple: false, requeue: false);
                }
                catch (Exception nackEx)
                {
                    _logger.LogError(nackEx, "Failed to nack MatchProcessingEvent");
                }
            }
        };
        _channel.BasicConsume("match-processing", autoAck: false, processingConsumer);

        _logger.LogInformation("MatchCompletedConsumer started and listening");

        await Task.Delay(Timeout.Infinite, stoppingToken);
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

    private async Task NotifyUser(MatchCompletedEvent evt)
    {
        await _hub.Clients.Group(evt.UserId.ToString())
            .SendAsync("MatchCompleted", new { evt.ApplicationId, evt.Status, evt.MatchScore, evt.GapAnalysis, evt.CompletedAt });
    }

    // Reuses the "MatchCompleted" SignalR method rather than adding a new one:
    // the frontend's push handler (applyMatchPush) already patches the cache
    // generically off a status string, and only toasts on Completed/Failed, so a
    // Processing push with null score/analysis/completedAt is already handled
    // correctly with zero frontend changes.
    private async Task NotifyProcessing(MatchProcessingEvent evt)
    {
        await _hub.Clients.Group(evt.UserId.ToString())
            .SendAsync("MatchCompleted", new
            {
                evt.ApplicationId,
                Status = nameof(MatchStatus.Processing),
                MatchScore = (int?)null,
                GapAnalysis = (string?)null,
                CompletedAt = (DateTime?)null,
            });
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
        base.Dispose();
    }
}
