using Microsoft.EntityFrameworkCore;
using JobCopilot.Api.Models;

namespace JobCopilot.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Application> Applications => Set<Application>();
    public DbSet<MatchResult> MatchResults => Set<MatchResult>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Application>()
            .HasOne(a => a.MatchResult)
            .WithOne(m => m.Application)
            .HasForeignKey<MatchResult>(m => m.ApplicationId);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();
    }
}
