using System.Text;
using System.Text.Json;
using RabbitMQ.Client;

namespace JobCopilot.Api.Messaging;

public class RabbitMqPublisher : IMessagePublisher, IDisposable
{
    private const string QueueName = "match-requests";
    private readonly IConnection _connection;
    private readonly IModel _channel;

    public RabbitMqPublisher(IConfiguration config)
    {
        var factory = new ConnectionFactory
        {
            HostName = config["RabbitMq:Host"] ?? "localhost",
            Port = int.Parse(config["RabbitMq:Port"] ?? "5672"),
            UserName = config["RabbitMq:Username"] ?? "jobcopilot",
            Password = config["RabbitMq:Password"] ?? "devpassword"
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        _channel.QueueDeclare(
            queue: QueueName,
            durable: true,
            exclusive: false,
            autoDelete: false);
    }

    public void PublishMatchRequested(MatchRequestedEvent evt)
    {
        var json = JsonSerializer.Serialize(evt);
        var body = Encoding.UTF8.GetBytes(json);

        var props = _channel.CreateBasicProperties();
        props.Persistent = true;

        _channel.BasicPublish(
            exchange: "",
            routingKey: QueueName,
            basicProperties: props,
            body: body);
    }

    public void Dispose()
    {
        _channel?.Dispose();
        _connection?.Dispose();
    }
}
