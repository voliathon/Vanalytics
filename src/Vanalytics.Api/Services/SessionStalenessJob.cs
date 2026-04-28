using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class SessionStalenessJob : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SessionStalenessJob> _logger;
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan StalenessThreshold = TimeSpan.FromMinutes(30);

    public SessionStalenessJob(IServiceScopeFactory scopeFactory, ILogger<SessionStalenessJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await AbandonStaleSessionsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Session staleness check failed");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }

    private async Task AbandonStaleSessionsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var cutoff = DateTimeOffset.UtcNow - StalenessThreshold;

        // Last-activity = max event timestamp, or StartedAt if no events exist.
        var stale = await db.Sessions
            .Where(s => s.Status == SessionStatus.Active)
            .Select(s => new
            {
                Session = s,
                LastActivity = s.Events.Any()
                    ? s.Events.Max(e => e.Timestamp)
                    : s.StartedAt
            })
            .Where(x => x.LastActivity < cutoff)
            .ToListAsync(ct);

        if (stale.Count == 0) return;

        foreach (var item in stale)
        {
            item.Session.Status = SessionStatus.Abandoned;
            item.Session.EndedAt = item.LastActivity;
        }

        await db.SaveChangesAsync(ct);

        _logger.LogInformation("Abandoned {Count} stale sessions", stale.Count);
    }
}
