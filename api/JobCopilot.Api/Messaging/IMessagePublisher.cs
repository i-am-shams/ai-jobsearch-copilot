using JobCopilot.Contracts;

namespace JobCopilot.Api.Messaging;

public interface IMessagePublisher
{
    void PublishMatchRequested(MatchRequestedEvent evt);
}
