using JobCopilot.Api.Services;
using JobCopilot.Contracts;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace JobCopilot.Api.Tests;

public class AuthServiceTests
{
    private readonly AuthService _authService;

    public AuthServiceTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "test-key-at-least-32-characters-long-for-hmac",
                ["Jwt:Issuer"] = "TestIssuer",
                ["Jwt:Audience"] = "TestAudience",
                ["Jwt:ExpiryMinutes"] = "60"
            })
            .Build();
        _authService = new AuthService(config);
    }

    [Fact]
    public void HashPassword_ProducesDifferentHashForSamePassword()
    {
        var hash1 = _authService.HashPassword("testpassword123");
        var hash2 = _authService.HashPassword("testpassword123");
        Assert.NotEqual(hash1, hash2);
    }

    [Fact]
    public void VerifyPassword_ReturnsTrueForCorrectPassword()
    {
        var hash = _authService.HashPassword("correctpassword");
        Assert.True(_authService.VerifyPassword("correctpassword", hash));
    }

    [Fact]
    public void VerifyPassword_ReturnsFalseForIncorrectPassword()
    {
        var hash = _authService.HashPassword("correctpassword");
        Assert.False(_authService.VerifyPassword("wrongpassword", hash));
    }

    [Fact]
    public void GenerateToken_ProducesNonEmptyToken()
    {
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com" };
        var token = _authService.GenerateToken(user);
        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.Contains(".", token);
    }
}
