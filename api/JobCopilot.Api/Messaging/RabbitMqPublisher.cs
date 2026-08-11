using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using JobCopilot.Contracts;

namespace JobCopilot.Api.Messaging;

/// <summary>
/// Publishes MatchRequested events to RabbitMQ. Connects lazily (tolerant of
/// RabbitMQ not being ready yet at API startup, e.g. during docker compose
/// startup ordering), but deliberately does NOT swallow exceptions — a failed
/// publish must be visible to the caller, since a silently-dropped message
/// means a user's submitted application would sit in "Pending" forever with
/// no indication anything went wrong.
/// </summary>
public class RabbitMqPublisher : IMessagePublisher, IDisposable
{
    private const string QueueName = "match-requests";
    private readonly IConfiguration _config;
    private IConnection? _connection;
    private IModel? _channel;
    private readonly object _lock = new object();

    public RabbitMqPublisher(IConfiguration config)
    {
        _config = config;
    }

    private void EnsureConnection()
    {
        lock (_lock)
        {
            if (_connection != null && _connection.IsOpen && _channel != null && _channel.IsOpen)
                return;

            var factory = new ConnectionFactory
            {
                HostName = _config["RabbitMq:Host"] ?? "localhost",
                Port = int.Parse(_config["RabbitMq:Port"] ?? "5672"),
                UserName = _config["RabbitMq:Username"] ?? "jobcopilot",
                Password = _config["RabbitMq:Password"] ?? "devpassword"
            };

            _connection = factory.CreateConnection();
            _channel = _connection.CreateModel();
            _channel.QueueDeclare(QueueName, durable: true, exclusive: false, autoDelete: false);
        }
    }

    public void PublishMatchRequested(MatchRequestedEvent evt)
    {
        lock (_lock)
        {
            EnsureConnection();
            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(evt));
            var props = _channel!.CreateBasicProperties();
            props.Persistent = true;
            _channel.BasicPublish("", QueueName, props, body);
        }
    }

    public void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
    }
}


