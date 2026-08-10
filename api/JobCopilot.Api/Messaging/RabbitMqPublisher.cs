using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using JobCopilot.Contracts;

namespace JobCopilot.Api.Messaging;

/// <summary>
/// Ultra-defensive RabbitMQ publisher.
/// Never throws any exceptions.
/// Connects lazily on first publish attempt.
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
        try
        {
            _config = config;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[RabbitMqPublisher] Constructor error: {ex.Message}");
        }
    }

    private void EnsureConnection()
    {
        lock (_lock)
        {
            if (_connection != null && _connection.IsOpen && _channel != null && _channel.IsOpen)
                return;

            try
            {
                var host = _config?["RabbitMq:Host"] ?? "localhost";
                var port = int.TryParse(_config?["RabbitMq:Port"], out var p) ? p : 5672;
                var username = _config?["RabbitMq:Username"] ?? "jobcopilot";
                var password = _config?["RabbitMq:Password"] ?? "devpassword";

                var factory = new ConnectionFactory
                {
                    HostName = host,
                    Port = port,
                    UserName = username,
                    Password = password
                };

                _connection = factory.CreateConnection();
                _channel = _connection.CreateModel();

                _channel.QueueDeclare(QueueName, durable: true, exclusive: false, autoDelete: false);
                Console.WriteLine($"[RabbitMqPublisher] Connected and declared queue '{QueueName}'");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RabbitMqPublisher] Connection error: {ex.Message}");
                _connection = null;
                _channel = null;
            }
        }
    }

    public void PublishMatchRequested(MatchRequestedEvent evt)
    {
        try
        {
            lock (_lock)
            {
                EnsureConnection();
                if (_channel?.IsOpen == true)
                {
                    var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(evt));
                    var props = _channel.CreateBasicProperties();
                    props.Persistent = true;
                    _channel.BasicPublish("", QueueName, props, body);
                    Console.WriteLine($"[RabbitMqPublisher] Published ApplicationId: {evt.ApplicationId}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[RabbitMqPublisher] Publish error: {ex.Message}");
        }
    }

    public void Dispose()
    {
        try
        {
            lock (_lock)
            {
                _channel?.Dispose();
                _connection?.Dispose();
            }
        }
        catch { }
    }
}


