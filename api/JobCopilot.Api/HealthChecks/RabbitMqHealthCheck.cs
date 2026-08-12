using Microsoft.Extensions.Diagnostics.HealthChecks;
using RabbitMQ.Client;

namespace JobCopilot.Api.HealthChecks;

/// <summary>
/// Readiness check for RabbitMQ.
///
/// Deliberately opens its own short-lived connection rather than inspecting the
/// one held by <see cref="Messaging.RabbitMqPublisher"/>: that connection is
/// created lazily on first publish, so on an idle API it would still be null
/// during a broker outage and the check would report healthy right up until the
/// first user submission failed.
///
/// Also deliberately hand-rolled instead of pulling in a third-party
/// health-check package - this project has already been bitten several times by
/// NuGet version drift, and one fewer dependency to pin is worth more here than
/// the few lines it saves.
/// </summary>
public class RabbitMqHealthCheck : IHealthCheck
{
    private readonly IConfiguration _config;

    public RabbitMqHealthCheck(IConfiguration config)
    {
        _config = config;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var factory = new ConnectionFactory
            {
                HostName = _config["RabbitMq:Host"] ?? "localhost",
                Port = int.Parse(_config["RabbitMq:Port"] ?? "5672"),
                UserName = _config["RabbitMq:Username"] ?? "jobcopilot",
                Password = _config["RabbitMq:Password"] ?? "devpassword",
                // Bounded so a hung broker fails the check quickly instead of
                // holding the readiness request open past the caller's timeout.
                RequestedConnectionTimeout = TimeSpan.FromSeconds(5)
            };

            using var connection = factory.CreateConnection();

            return Task.FromResult(connection.IsOpen
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("RabbitMQ connection is not open."));
        }
        catch (Exception ex)
        {
            return Task.FromResult(HealthCheckResult.Unhealthy("RabbitMQ is unreachable.", ex));
        }
    }
}
