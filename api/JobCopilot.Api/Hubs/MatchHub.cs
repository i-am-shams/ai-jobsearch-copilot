using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using System.IdentityModel.Tokens.Jwt;

namespace JobCopilot.Api.Hubs;

[Authorize]
public class MatchHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User!.FindFirst(JwtRegisteredClaimNames.Sub)!.Value;
        await Groups.AddToGroupAsync(Context.ConnectionId, userId);
        await base.OnConnectedAsync();
    }
}
