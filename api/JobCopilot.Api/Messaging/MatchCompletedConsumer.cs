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
        _channel.QueueDeclare("match-completed", durable: true, exclusive: false, autoDelete: false);

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
                _logger.LogError(ex, "Error processing MatchCompletedEvent");
            }
        };
        _channel.BasicConsume("match-completed", autoAck: false, consumer);
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
            .SendAsync("MatchCompleted", new { evt.ApplicationId, evt.MatchScore, evt.GapAnalysis });
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
        base.Dispose();
    }
}
