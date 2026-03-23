# Server Status Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/servers` page with a public BI-style analytics dashboard at `/server/status` that visualizes FFXI server uptime with KPI cards, trend charts, a heatmap, rankings, and incident feed.

**Architecture:** New `/api/servers/analytics` endpoint computes all dashboard metrics from existing `GameServers` + `ServerStatusChanges` tables with `IMemoryCache` (5-min TTL). Frontend is a set of focused React components using Recharts for charts and custom CSS grid for the heatmap. Existing per-server detail view moves to `/server/status/:name` with a new uptime trend chart. Routes are public (no auth).

**Tech Stack:** .NET 10 / EF Core, React 19, TypeScript, Recharts 3.8, Tailwind CSS 4.2, xUnit + Testcontainers

**Spec:** `docs/superpowers/specs/2026-03-23-server-status-dashboard-design.md`

---

## File Structure

### Backend (new/modified)
| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/Vanalytics.Api/Controllers/ServersController.cs` | Add `/analytics` endpoint, extend `/history` with trend data, lift 365-day cap for `days=0` |
| Modify | `src/Vanalytics.Api/Program.cs` | Register `IMemoryCache` if not already registered |
| Create | `tests/Vanalytics.Api.Tests/Controllers/ServersControllerTests.cs` | Integration tests for analytics + extended history endpoints |

### Frontend (new/modified)
| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/Vanalytics.Web/src/types/api.ts` | Add analytics response types |
| Create | `src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx` | Dashboard page component |
| Create | `src/Vanalytics.Web/src/pages/ServerDetailPage.tsx` | Per-server detail page (refactored from ServerStatusPage) |
| Create | `src/Vanalytics.Web/src/components/server/ServiceHealthCards.tsx` | KPI cards row |
| Create | `src/Vanalytics.Web/src/components/server/UptimeTrendChart.tsx` | Recharts area chart (reusable) |
| Create | `src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx` | CSS grid heatmap |
| Create | `src/Vanalytics.Web/src/components/server/ServerRankings.tsx` | Ranked uptime table |
| Create | `src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx` | Condensed status pills |
| Create | `src/Vanalytics.Web/src/components/server/RecentIncidents.tsx` | Recent status change feed |
| Modify | `src/Vanalytics.Web/src/App.tsx` | Update routes: `/server/status`, `/server/status/:name`, `/server/clock`, redirect `/servers` |
| Modify | `src/Vanalytics.Web/src/components/Layout.tsx` | Update sidebar nav links + `getSection()` to use `/server/*` paths |
| Delete | `src/Vanalytics.Web/src/pages/ServerStatusPage.tsx` | Replaced by new dashboard + detail page |

---

## Task 1: Add TypeScript types for analytics API

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts:77-98`

- [ ] **Step 1: Add new types after existing server types**

Add these types after the existing `ServerStatusEntry` interface (after line 98):

```typescript
// Server Analytics Dashboard
export interface ServerAnalytics {
  serviceHealth: ServiceHealth
  uptimeTrend: TrendPoint[]
  serverRankings: ServerRanking[]
  heatmap: ServerHeatmapData[]
  recentIncidents: ServerIncident[]
}

export interface ServiceHealth {
  status: string
  onlinePercent: number
  uptimePercent: number
  totalServers: number
  onlineServers: number
  lastCheckedAt: string | null
}

export interface TrendPoint {
  timestamp: string
  percent: number
}

export interface ServerRanking {
  name: string
  uptimePercent: number
  status: string
}

export interface ServerHeatmapData {
  name: string
  days: HeatmapCell[]
}

export interface HeatmapCell {
  date: string
  uptimePercent: number
  dominantStatus: string
}

export interface ServerIncident {
  id: number
  serverName: string
  status: string
  startedAt: string
  endedAt: string | null
  duration: string | null
}
```

- [ ] **Step 2: Extend existing ServerHistory interface to include uptimeTrend**

Change the `ServerHistory` interface (lines 85-92) to:

```typescript
export interface ServerHistory {
  name: string
  status: string
  lastCheckedAt: string
  days: number
  uptimePercent: number
  uptimeTrend: TrendPoint[]
  history: ServerStatusEntry[]
}
```

- [ ] **Step 3: Verify the frontend builds**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors (types are just definitions, nothing consumes them yet)

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/types/api.ts
git commit -m "$(cat <<'EOF'
feat(server-dashboard): add TypeScript types for analytics API

Add ServerAnalytics, ServiceHealth, TrendPoint, ServerRanking,
ServerHeatmapData, HeatmapCell, and ServerIncident interfaces.
Extend ServerHistory with uptimeTrend field.
EOF
)"
```

---

## Task 2: Backend — Analytics endpoint

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/ServersController.cs`
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Register IMemoryCache in Program.cs**

In `src/Vanalytics.Api/Program.cs`, add `builder.Services.AddMemoryCache();` near the other service registrations (after line ~15, near the existing `AddSingleton` calls). Add `using Microsoft.Extensions.Caching.Memory;` if not already present.

- [ ] **Step 2: Add the analytics endpoint to ServersController**

Add `using Microsoft.Extensions.Caching.Memory;` and `using Vanalytics.Core.Enums;` to the imports. Add `IMemoryCache` as a constructor dependency alongside the existing `VanalyticsDbContext`.

Add a new endpoint after the existing `History` method:

```csharp
[HttpGet("analytics")]
public async Task<IActionResult> Analytics([FromQuery] int days = 30)
{
    var cacheKey = $"server-analytics-{days}";
    if (_cache.TryGetValue(cacheKey, out object? cached))
        return Ok(cached);

    var now = DateTimeOffset.UtcNow;
    var servers = await _db.GameServers.OrderBy(s => s.Name).ToListAsync();

    // For "All Time" (days=0), use earliest server creation date instead of MinValue
    var since = days == 0 && servers.Count > 0
        ? servers.Min(s => s.CreatedAt)
        : days == 0 ? now : now.AddDays(-days);

    var allChanges = await _db.ServerStatusChanges
        .Where(h => h.EndedAt == null || h.EndedAt > since)
        .ToListAsync();

    var totalMinutes = (now - since).TotalMinutes;

    // Service health
    var onlineCount = servers.Count(s => s.Status == ServerStatus.Online);
    var onlinePercent = servers.Count > 0 ? Math.Round((double)onlineCount / servers.Count * 100, 2) : 0;

    // Per-server uptime calculation
    var serverUptimes = new Dictionary<string, double>();
    foreach (var server in servers)
    {
        var changes = allChanges.Where(c => c.GameServerId == server.Id).ToList();
        var onlineMinutes = 0.0;
        foreach (var change in changes)
        {
            if (change.Status != ServerStatus.Online) continue;
            var start = change.StartedAt < since ? since : change.StartedAt;
            var end = change.EndedAt ?? now;
            onlineMinutes += (end - start).TotalMinutes;
        }
        serverUptimes[server.Name] = totalMinutes > 0 ? Math.Round(onlineMinutes / totalMinutes * 100, 2) : 0;
    }

    var avgUptime = serverUptimes.Count > 0 ? Math.Round(serverUptimes.Values.Average(), 2) : 0;

    var healthStatus = onlinePercent >= 90 ? "Healthy" : onlinePercent >= 50 ? "Degraded" : "Down";

    // Uptime trend — % of servers online at each time bucket
    var bucketMinutes = days switch
    {
        0 => 1440,    // daily
        >= 90 => 1440, // daily
        >= 7 => 60,    // hourly
        _ => 5         // 5-min
    };
    var bucketSpan = TimeSpan.FromMinutes(bucketMinutes);
    var trendStart = days == 0 ? servers.Min(s => s.CreatedAt) : since;
    // Round trendStart down to the bucket boundary
    trendStart = new DateTimeOffset(trendStart.UtcDateTime.Ticks / bucketSpan.Ticks * bucketSpan.Ticks, TimeSpan.Zero);
    var trend = new List<object>();
    for (var t = trendStart; t <= now; t = t.Add(bucketSpan))
    {
        var bucketEnd = t.Add(bucketSpan);
        var onlineInBucket = 0;
        foreach (var server in servers)
        {
            var wasOnline = allChanges.Any(c =>
                c.GameServerId == server.Id &&
                c.Status == ServerStatus.Online &&
                c.StartedAt < bucketEnd &&
                (c.EndedAt == null || c.EndedAt > t));
            if (wasOnline) onlineInBucket++;
        }
        trend.Add(new
        {
            Timestamp = t,
            Percent = servers.Count > 0 ? Math.Round((double)onlineInBucket / servers.Count * 100, 2) : 0
        });
    }

    // Heatmap — per-server, per-day/week uptime
    var heatmapBucketDays = days > 90 ? 7 : 1;
    var heatmap = new List<object>();
    foreach (var server in servers)
    {
        var changes = allChanges.Where(c => c.GameServerId == server.Id).ToList();
        var cells = new List<object>();
        var heatmapStart = days == 0 ? server.CreatedAt.Date : since.Date;
        // Align to ISO week (Monday) for weekly buckets
        if (heatmapBucketDays == 7)
        {
            var dow = ((int)heatmapStart.DayOfWeek + 6) % 7; // Monday=0
            heatmapStart = heatmapStart.AddDays(-dow);
        }
        for (var d = heatmapStart; d <= now.Date; d = d.AddDays(heatmapBucketDays))
        {
            var cellStart = new DateTimeOffset(d, TimeSpan.Zero);
            var cellEnd = new DateTimeOffset(d.AddDays(heatmapBucketDays), TimeSpan.Zero);
            if (cellEnd > now) cellEnd = now;
            var cellMinutes = (cellEnd - cellStart).TotalMinutes;
            var cellOnlineMinutes = 0.0;
            var statusCounts = new Dictionary<ServerStatus, double>();
            foreach (var change in changes)
            {
                if (change.StartedAt >= cellEnd || (change.EndedAt != null && change.EndedAt <= cellStart)) continue;
                var start = change.StartedAt < cellStart ? cellStart : change.StartedAt;
                var end = change.EndedAt == null || change.EndedAt > cellEnd ? cellEnd : change.EndedAt.Value;
                var minutes = (end - start).TotalMinutes;
                if (change.Status == ServerStatus.Online) cellOnlineMinutes += minutes;
                statusCounts[change.Status] = statusCounts.GetValueOrDefault(change.Status) + minutes;
            }
            var dominantStatus = statusCounts.Count > 0
                ? statusCounts.OrderByDescending(kv => kv.Value).First().Key.ToString()
                : "Unknown";
            cells.Add(new
            {
                Date = d.ToString("yyyy-MM-dd"),
                UptimePercent = cellMinutes > 0 ? Math.Round(cellOnlineMinutes / cellMinutes * 100, 2) : 0,
                DominantStatus = dominantStatus
            });
        }
        heatmap.Add(new { server.Name, Days = cells });
    }

    // Server rankings
    var rankings = serverUptimes
        .OrderByDescending(kv => kv.Value)
        .Select(kv => new
        {
            Name = kv.Key,
            UptimePercent = kv.Value,
            Status = servers.First(s => s.Name == kv.Key).Status.ToString()
        })
        .ToList();

    // Recent incidents — latest 10 status changes that are not "Online"
    // Materialize first, then format in-memory (EF Core can't translate FormatDuration)
    var rawIncidents = await _db.ServerStatusChanges
        .Include(c => c.GameServer)
        .Where(c => c.Status != ServerStatus.Online)
        .OrderByDescending(c => c.StartedAt)
        .Take(10)
        .ToListAsync();

    var incidents = rawIncidents.Select(c => new
    {
        c.Id,
        ServerName = c.GameServer.Name,
        Status = c.Status.ToString(),
        c.StartedAt,
        c.EndedAt,
        Duration = c.EndedAt != null
            ? FormatDuration(c.EndedAt.Value - c.StartedAt)
            : (string?)null
    }).ToList();

    // Determine the most recent lastCheckedAt across all servers (for stale data warning)
    var lastCheckedAt = servers.Count > 0 ? servers.Max(s => s.LastCheckedAt) : (DateTimeOffset?)null;

    var result = new
    {
        ServiceHealth = new
        {
            Status = healthStatus,
            OnlinePercent = onlinePercent,
            UptimePercent = avgUptime,
            TotalServers = servers.Count,
            OnlineServers = onlineCount,
            LastCheckedAt = lastCheckedAt
        },
        UptimeTrend = trend,
        ServerRankings = rankings,
        Heatmap = heatmap,
        RecentIncidents = incidents
    };

    _cache.Set(cacheKey, result, TimeSpan.FromMinutes(5));

    return Ok(result);
}

private static string FormatDuration(TimeSpan span)
{
    if (span.TotalDays >= 1) return $"{(int)span.TotalDays}d {span.Hours}h";
    if (span.TotalHours >= 1) return $"{(int)span.TotalHours}h {span.Minutes}m";
    return $"{(int)span.TotalMinutes}m";
}
```

- [ ] **Step 3: Extend the existing History endpoint with uptimeTrend**

Modify the `History` method to:
1. Change `if (days > 365) days = 365;` to `if (days > 365 && days != 0) days = 365;`
2. Handle `days == 0` for the `since` calculation: `var since = days == 0 ? DateTimeOffset.MinValue : DateTimeOffset.UtcNow.AddDays(-days);`
3. After computing `uptimePercent`, add the trend computation (same bucket logic as analytics but for a single server):

```csharp
// Uptime trend for this server
var bucketMinutes = days switch
{
    0 => 1440,
    >= 90 => 1440,
    >= 7 => 60,
    _ => 5
};
var bucketSpan = TimeSpan.FromMinutes(bucketMinutes);
var trendStart = days == 0 ? server.CreatedAt : since;
trendStart = new DateTimeOffset(trendStart.UtcDateTime.Ticks / bucketSpan.Ticks * bucketSpan.Ticks, TimeSpan.Zero);
var uptimeTrend = new List<object>();
for (var t = trendStart; t <= now; t = t.Add(bucketSpan))
{
    var bucketEnd = t.Add(bucketSpan);
    var wasOnline = allChanges.Any(c =>
        c.Status == ServerStatus.Online &&
        c.StartedAt < bucketEnd &&
        (c.EndedAt == null || c.EndedAt > t));
    uptimeTrend.Add(new
    {
        Timestamp = t,
        Percent = wasOnline ? 100.0 : 0.0
    });
}
```

Add `UptimeTrend = uptimeTrend` to the anonymous return object. Also add `var now = DateTimeOffset.UtcNow;` at the top of the method and use `now` consistently instead of `DateTimeOffset.UtcNow`.

- [ ] **Step 4: Verify it compiles**

Run: `cd src/Vanalytics.Api && dotnet build`
Expected: Build succeeded

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Api/Controllers/ServersController.cs src/Vanalytics.Api/Program.cs
git commit -m "$(cat <<'EOF'
feat(server-dashboard): add analytics endpoint and extend history with trend data

New GET /api/servers/analytics?days=N returns service health, uptime
trend, server rankings, heatmap, and recent incidents. All computed
from existing tables with 5-min IMemoryCache. Extended history
endpoint with uptimeTrend array and days=0 for All Time support.
EOF
)"
```

---

## Task 3: Backend — Integration tests for analytics endpoint

**Files:**
- Create: `tests/Vanalytics.Api.Tests/Controllers/ServersControllerTests.cs`

- [ ] **Step 1: Create the test file**

Follow the exact pattern from `CharactersControllerTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ServersControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7"
                    });
                });
            });
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task SeedServersAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var now = DateTimeOffset.UtcNow;

        var asura = new GameServer { Name = "Asura", Status = ServerStatus.Online, LastCheckedAt = now, CreatedAt = now.AddDays(-30) };
        var bahamut = new GameServer { Name = "Bahamut", Status = ServerStatus.Maintenance, LastCheckedAt = now, CreatedAt = now.AddDays(-30) };
        db.GameServers.AddRange(asura, bahamut);
        await db.SaveChangesAsync();

        // Asura: online for 30 days
        db.ServerStatusChanges.Add(new ServerStatusChange
        {
            GameServerId = asura.Id,
            Status = ServerStatus.Online,
            StartedAt = now.AddDays(-30),
            EndedAt = null
        });

        // Bahamut: online for 29 days, then maintenance for 1 day
        db.ServerStatusChanges.Add(new ServerStatusChange
        {
            GameServerId = bahamut.Id,
            Status = ServerStatus.Online,
            StartedAt = now.AddDays(-30),
            EndedAt = now.AddDays(-1)
        });
        db.ServerStatusChanges.Add(new ServerStatusChange
        {
            GameServerId = bahamut.Id,
            Status = ServerStatus.Maintenance,
            StartedAt = now.AddDays(-1),
            EndedAt = null
        });

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Analytics_ReturnsAllSections()
    {
        await SeedServersAsync();

        var response = await _client.GetAsync("/api/servers/analytics?days=30");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(json.TryGetProperty("serviceHealth", out var health));
        Assert.True(health.TryGetProperty("status", out _));
        Assert.True(health.TryGetProperty("onlinePercent", out _));
        Assert.True(health.TryGetProperty("uptimePercent", out _));
        Assert.True(health.TryGetProperty("totalServers", out var total));
        Assert.Equal(2, total.GetInt32());

        Assert.True(json.TryGetProperty("uptimeTrend", out var trend));
        Assert.True(trend.GetArrayLength() > 0);

        Assert.True(json.TryGetProperty("serverRankings", out var rankings));
        Assert.Equal(2, rankings.GetArrayLength());

        Assert.True(json.TryGetProperty("heatmap", out var heatmap));
        Assert.Equal(2, heatmap.GetArrayLength());

        Assert.True(json.TryGetProperty("recentIncidents", out _));
    }

    [Fact]
    public async Task Analytics_HealthStatus_ReflectsCurrentState()
    {
        await SeedServersAsync();

        var json = await _client.GetFromJsonAsync<JsonElement>("/api/servers/analytics?days=30");
        var health = json.GetProperty("serviceHealth");

        // 1 of 2 servers online = 50%, which is "Degraded"
        Assert.Equal("Degraded", health.GetProperty("status").GetString());
        Assert.Equal(50, health.GetProperty("onlinePercent").GetDouble());
        Assert.Equal(1, health.GetProperty("onlineServers").GetInt32());
    }

    [Fact]
    public async Task Analytics_Rankings_OrderedByUptime()
    {
        await SeedServersAsync();

        var json = await _client.GetFromJsonAsync<JsonElement>("/api/servers/analytics?days=30");
        var rankings = json.GetProperty("serverRankings");

        var first = rankings[0].GetProperty("name").GetString();
        var second = rankings[1].GetProperty("name").GetString();
        Assert.Equal("Asura", first); // 100% uptime
        Assert.Equal("Bahamut", second); // ~96.67% uptime
    }

    [Fact]
    public async Task Analytics_AllTime_WorksWithDaysZero()
    {
        await SeedServersAsync();

        var response = await _client.GetAsync("/api/servers/analytics?days=0");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task History_IncludesUptimeTrend()
    {
        await SeedServersAsync();

        var json = await _client.GetFromJsonAsync<JsonElement>("/api/servers/Asura/history?days=7");

        Assert.True(json.TryGetProperty("uptimeTrend", out var trend));
        Assert.True(trend.GetArrayLength() > 0);

        // Asura is always online, so all trend points should be 100
        foreach (var point in trend.EnumerateArray())
        {
            Assert.Equal(100.0, point.GetProperty("percent").GetDouble());
        }
    }

    [Fact]
    public async Task History_DaysZero_LiftsCapAndReturnsData()
    {
        await SeedServersAsync();

        var response = await _client.GetAsync("/api/servers/Asura/history?days=0");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, json.GetProperty("days").GetInt32());
    }

    [Fact]
    public async Task Analytics_EmptyDatabase_ReturnsEmptyResult()
    {
        var response = await _client.GetAsync("/api/servers/analytics?days=30");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var health = json.GetProperty("serviceHealth");
        Assert.Equal(0, health.GetProperty("totalServers").GetInt32());
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cd tests/Vanalytics.Api.Tests && dotnet test --filter "ServersControllerTests" -v normal`
Expected: All 7 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/Vanalytics.Api.Tests/Controllers/ServersControllerTests.cs
git commit -m "$(cat <<'EOF'
test(server-dashboard): add integration tests for analytics and extended history endpoints

Tests cover: full analytics response shape, health status calculation,
ranking order, days=0 (All Time), history uptimeTrend inclusion,
and empty database edge case.
EOF
)"
```

---

## Task 4: Frontend — UptimeTrendChart component

**Files:**
- Create: `src/Vanalytics.Web/src/components/server/UptimeTrendChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { TrendPoint } from '../../types/api'

interface Props {
  data: TrendPoint[]
  height?: number
}

export default function UptimeTrendChart({ data, height = 300 }: Props) {
  const formatted = data.map(p => ({
    ...p,
    time: new Date(p.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value: number) => [`${value}%`, 'Uptime']}
        />
        <Area
          type="monotone"
          dataKey="percent"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/UptimeTrendChart.tsx
git commit -m "feat(server-dashboard): add UptimeTrendChart component"
```

---

## Task 5: Frontend — ServiceHealthCards component

**Files:**
- Create: `src/Vanalytics.Web/src/components/server/ServiceHealthCards.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { ServiceHealth, ServerRanking } from '../../types/api'

interface Props {
  health: ServiceHealth
  rankings: ServerRanking[]
}

const statusColors: Record<string, string> = {
  Healthy: 'text-green-400 border-green-900/50',
  Degraded: 'text-amber-400 border-amber-900/50',
  Down: 'text-red-400 border-red-900/50',
}

export default function ServiceHealthCards({ health, rankings }: Props) {
  const best = rankings[0]
  const worst = rankings[rankings.length - 1]
  const statusClass = statusColors[health.status] ?? 'text-gray-400 border-gray-700'

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Service Health" className={statusClass}>
        <p className="text-2xl font-bold">{health.status}</p>
        <p className="text-xs text-gray-500">{health.onlinePercent}% of worlds online</p>
      </Card>
      <Card label="Average Uptime">
        <p className="text-2xl font-bold text-blue-400">{health.uptimePercent}%</p>
        <p className="text-xs text-gray-500">All servers over period</p>
      </Card>
      <Card label="Best Server">
        <p className="text-2xl font-bold text-green-400">{best?.name ?? '—'}</p>
        <p className="text-xs text-gray-500">{best ? `${best.uptimePercent}% uptime` : 'No data'}</p>
      </Card>
      <Card label="Worst Server">
        <p className="text-2xl font-bold text-amber-400">{worst?.name ?? '—'}</p>
        <p className="text-xs text-gray-500">{worst ? `${worst.uptimePercent}% uptime` : 'No data'}</p>
      </Card>
    </div>
  )
}

function Card({ label, className = 'border-gray-700', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border bg-gray-900 p-4 text-center ${className}`}>
      <p className="text-xs uppercase text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/ServiceHealthCards.tsx
git commit -m "feat(server-dashboard): add ServiceHealthCards component"
```

---

## Task 6: Frontend — ServerHeatmap component

**Files:**
- Create: `src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useNavigate } from 'react-router-dom'
import type { ServerHeatmapData } from '../../types/api'

interface Props {
  data: ServerHeatmapData[]
  days: number
}

function cellColor(uptimePercent: number): string {
  if (uptimePercent < 0) return 'bg-gray-800' // no data
  if (uptimePercent > 99) return 'bg-green-500'
  if (uptimePercent > 95) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ServerHeatmap({ data, days }: Props) {
  const navigate = useNavigate()

  if (data.length === 0) return <p className="text-gray-500 text-sm">No data</p>

  // Limit visible columns for readability
  const maxCols = days <= 7 ? data[0]?.days.length : days <= 30 ? 30 : days <= 90 ? 90 : 52

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[400px]">
        {data.map(server => (
          <div key={server.name} className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate(`/server/status/${encodeURIComponent(server.name)}?days=${days}`)}
              className="w-20 text-xs text-gray-400 text-right truncate hover:text-blue-400 shrink-0"
              title={server.name}
            >
              {server.name}
            </button>
            <div className="flex gap-px flex-1">
              {server.days.slice(-maxCols).map((cell, i) => (
                <div
                  key={i}
                  className={`h-3 flex-1 rounded-sm ${cellColor(cell.uptimePercent)}`}
                  title={`${cell.date}: ${cell.uptimePercent}% (${cell.dominantStatus})`}
                />
              ))}
            </div>
          </div>
        ))}
        {/* Date labels */}
        <div className="flex items-center gap-2 mt-1">
          <div className="w-20 shrink-0" />
          <div className="flex justify-between flex-1 text-[10px] text-gray-600">
            <span>{data[0]?.days[Math.max(0, data[0].days.length - maxCols)]?.date ?? ''}</span>
            <span>{data[0]?.days[data[0].days.length - 1]?.date ?? ''}</span>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 mt-2">
          <div className="w-20 shrink-0" />
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> &gt;99%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> &gt;95%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> &le;95%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-gray-800" /> No data</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx
git commit -m "feat(server-dashboard): add ServerHeatmap component"
```

---

## Task 7: Frontend — ServerRankings, CurrentStatusGrid, RecentIncidents

**Files:**
- Create: `src/Vanalytics.Web/src/components/server/ServerRankings.tsx`
- Create: `src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx`
- Create: `src/Vanalytics.Web/src/components/server/RecentIncidents.tsx`

- [ ] **Step 1: Create ServerRankings**

```tsx
import { useNavigate } from 'react-router-dom'
import type { ServerRanking } from '../../types/api'

interface Props {
  rankings: ServerRanking[]
  days: number
}

function uptimeColor(pct: number): string {
  if (pct > 99) return 'text-green-400'
  if (pct > 95) return 'text-amber-400'
  return 'text-red-400'
}

export default function ServerRankings({ rankings, days }: Props) {
  const navigate = useNavigate()

  return (
    <div className="space-y-0">
      {rankings.map((server, i) => (
        <button
          key={server.name}
          onClick={() => navigate(`/server/status/${encodeURIComponent(server.name)}?days=${days}`)}
          className="flex w-full items-center justify-between px-2 py-1.5 text-sm hover:bg-gray-800/50 rounded transition-colors"
        >
          <span className="text-gray-300">{i + 1}. {server.name}</span>
          <span className={uptimeColor(server.uptimePercent)}>{server.uptimePercent}%</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create CurrentStatusGrid**

```tsx
import { useNavigate } from 'react-router-dom'

interface Props {
  servers: { name: string; status: string }[]
}

const dotColor: Record<string, string> = {
  Online: 'bg-green-400',
  Offline: 'bg-red-400',
  Maintenance: 'bg-amber-400',
  Unknown: 'bg-gray-400',
}

export default function CurrentStatusGrid({ servers }: Props) {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {servers.map(s => (
        <button
          key={s.name}
          onClick={() => navigate(`/server/status/${encodeURIComponent(s.name)}`)}
          className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs hover:bg-gray-800/50 transition-colors"
        >
          <span className={`h-2 w-2 rounded-full ${dotColor[s.status] ?? 'bg-gray-400'}`} />
          <span className="text-gray-300 truncate">{s.name}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create RecentIncidents**

```tsx
import type { ServerIncident } from '../../types/api'

interface Props {
  incidents: ServerIncident[]
}

const statusIcon: Record<string, { dot: string; label: string }> = {
  Offline: { dot: 'bg-red-400', label: 'Went offline' },
  Maintenance: { dot: 'bg-amber-400', label: 'Maintenance' },
  Unknown: { dot: 'bg-gray-400', label: 'Unknown' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function RecentIncidents({ incidents }: Props) {
  if (incidents.length === 0) return <p className="text-gray-500 text-sm">No recent incidents</p>

  return (
    <div className="space-y-0">
      {incidents.map(inc => {
        const info = statusIcon[inc.status] ?? statusIcon.Unknown
        return (
          <div key={inc.id} className="flex items-start gap-2 px-2 py-1.5 text-sm border-b border-gray-800/50 last:border-0">
            <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${info.dot}`} />
            <div className="min-w-0">
              <span className="text-gray-200">{inc.serverName}</span>
              <span className="text-gray-500"> — {info.label} {timeAgo(inc.startedAt)}</span>
              {inc.duration && <span className="text-gray-600"> ({inc.duration})</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Verify all compile**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Web/src/components/server/ServerRankings.tsx src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx src/Vanalytics.Web/src/components/server/RecentIncidents.tsx
git commit -m "feat(server-dashboard): add Rankings, StatusGrid, and Incidents components"
```

---

## Task 8: Frontend — ServerStatusDashboard page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx`

- [ ] **Step 1: Create the dashboard page**

```tsx
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { ServerAnalytics } from '../types/api'
import ServiceHealthCards from '../components/server/ServiceHealthCards'
import UptimeTrendChart from '../components/server/UptimeTrendChart'
import ServerHeatmap from '../components/server/ServerHeatmap'
import ServerRankings from '../components/server/ServerRankings'
import CurrentStatusGrid from '../components/server/CurrentStatusGrid'
import RecentIncidents from '../components/server/RecentIncidents'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
  { label: 'All', days: 0 },
]

export default function ServerStatusDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const daysParam = searchParams.get('days')
  const [days, setDays] = useState(daysParam ? Number(daysParam) : 30)
  const [data, setData] = useState<ServerAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api<ServerAnalytics>(`/api/servers/analytics?days=${days}`)
      .then(setData)
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load analytics (${err.status})`)
        else setError('Failed to load analytics')
      })
      .finally(() => setLoading(false))
  }, [days])

  const changeDays = (d: number) => {
    setDays(d)
    setSearchParams({ days: String(d) })
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !data) {
    return <p className="text-center text-red-400 py-20">{error}</p>
  }

  if (!data) return null

  // Stale data warning
  const lastChecked = data.serviceHealth.lastCheckedAt ? new Date(data.serviceHealth.lastCheckedAt) : null
  const isStale = lastChecked ? (Date.now() - lastChecked.getTime()) > 10 * 60 * 1000 : false
  const currentServers = data.serverRankings.map(r => ({ name: r.name, status: r.status }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Server Status</h1>
          <p className="text-sm text-gray-500">FFXI service health and uptime analytics</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800">
          {TIME_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => changeDays(r.days)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                days === r.days
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isStale && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-900/20 px-4 py-2 text-sm text-amber-400">
          Status data may be outdated — last check was {Math.round((Date.now() - lastChecked!.getTime()) / 60000)} minutes ago.
        </div>
      )}

      <ServiceHealthCards health={data.serviceHealth} rankings={data.serverRankings} />

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Service Uptime Trend</h2>
        {data.uptimeTrend.length > 0
          ? <UptimeTrendChart data={data.uptimeTrend} />
          : <p className="text-gray-500 text-sm py-10 text-center">Collecting server data — check back soon.</p>
        }
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Server Heatmap</h2>
          <ServerHeatmap data={data.heatmap} days={days} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Server Rankings</h2>
          <ServerRankings rankings={data.serverRankings} days={days} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Current Status</h2>
          <CurrentStatusGrid servers={currentServers} />
        </section>
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-xs uppercase text-gray-500 mb-3">Recent Incidents</h2>
          <RecentIncidents incidents={data.recentIncidents} />
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx
git commit -m "feat(server-dashboard): add ServerStatusDashboard page component"
```

---

## Task 9: Frontend — ServerDetailPage (refactored from ServerStatusPage)

**Files:**
- Create: `src/Vanalytics.Web/src/pages/ServerDetailPage.tsx`

- [ ] **Step 1: Create the detail page**

This is the existing per-server detail view (from `ServerStatusPage.tsx`) restructured as a standalone page that receives the server name from the URL. Key changes from original:
- Gets server name from URL params instead of click selection
- Adds `← All Servers` back link
- Adds `UptimeTrendChart` above the existing timeline
- Uses URL state for days param
- Supports the expanded time range options (24h, 48h, 7d, 30d, 90d, 365d, All Time)

```tsx
import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { ServerHistory } from '../types/api'
import UptimeTrendChart from '../components/server/UptimeTrendChart'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '365d', days: 365 },
  { label: 'All', days: 0 },
]

const PAGE_SIZE = 10

const statusColors: Record<string, string> = {
  Online: 'bg-green-500',
  Offline: 'bg-red-500',
  Maintenance: 'bg-amber-500',
  Unknown: 'bg-gray-500',
}

const statusTextColors: Record<string, string> = {
  Online: 'bg-green-900/50 text-green-400',
  Offline: 'bg-red-900/50 text-red-400',
  Maintenance: 'bg-amber-900/50 text-amber-400',
  Unknown: 'bg-gray-900/50 text-gray-400',
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function ServerDetailPage() {
  const { name } = useParams<{ name: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const daysParam = searchParams.get('days')
  const [days, setDays] = useState(daysParam ? Number(daysParam) : 30)
  const [history, setHistory] = useState<ServerHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setError('')
    api<ServerHistory>(`/api/servers/${encodeURIComponent(name)}/history?days=${days}`)
      .then(setHistory)
      .catch(err => {
        if (err instanceof ApiError) setError(err.status === 404 ? 'Server not found' : `Error (${err.status})`)
        else setError('Failed to load server history')
      })
      .finally(() => setLoading(false))
  }, [name, days])

  const changeDays = (d: number) => {
    setDays(d)
    setSearchParams({ days: String(d) })
    setPage(1)
  }

  const filtered = useMemo(() => {
    if (!history) return []
    return statusFilter === 'All'
      ? history.history
      : history.history.filter(e => e.status === statusFilter)
  }, [history, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading && !history) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error) return <p className="text-center text-red-400 py-20">{error}</p>
  if (!history) return null

  // Timeline bar computation
  const now = Date.now()
  const rangeStart = days === 0
    ? Math.min(...history.history.map(h => new Date(h.startedAt).getTime()), now)
    : now - days * 86400000
  const totalMs = now - rangeStart

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/server/status?days=${days}`} className="text-gray-400 hover:text-blue-400 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{history.name}</h1>
          <p className="text-sm text-gray-500">
            <span className={`inline-block h-2 w-2 rounded-full mr-1 ${statusColors[history.status] ?? 'bg-gray-500'}`} />
            {history.status} — {history.uptimePercent}% uptime
          </p>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800 w-fit">
        {TIME_RANGES.map(r => (
          <button
            key={r.days}
            onClick={() => changeDays(r.days)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              days === r.days ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Uptime trend chart */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Uptime Trend</h2>
        {history.uptimeTrend && history.uptimeTrend.length > 0
          ? <UptimeTrendChart data={history.uptimeTrend} height={250} />
          : <p className="text-gray-500 text-sm py-10 text-center">No trend data available</p>
        }
      </section>

      {/* Status timeline bar */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-xs uppercase text-gray-500 mb-3">Status Timeline</h2>
        <div className="relative h-8 rounded overflow-hidden bg-gray-800">
          {history.history.map((entry, i) => {
            const start = Math.max(new Date(entry.startedAt).getTime(), rangeStart)
            const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
            const left = ((start - rangeStart) / totalMs) * 100
            const width = ((end - start) / totalMs) * 100
            if (width < 0.05) return null
            return (
              <div
                key={i}
                className={`absolute top-0 h-full ${statusColors[entry.status] ?? 'bg-gray-500'}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${entry.status}: ${new Date(entry.startedAt).toLocaleString()} — ${entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Current'}`}
              />
            )
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>{new Date(rangeStart).toLocaleDateString()}</span>
          <span>Now</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Online</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Offline</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> Maintenance</span>
        </div>
      </section>

      {/* Event log */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase text-gray-500">Event Log</h2>
          <div className="flex gap-1">
            {['All', 'Online', 'Offline', 'Maintenance'].map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Started</th>
                <th className="pb-2 pr-4">Ended</th>
                <th className="pb-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((entry, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusTextColors[entry.status] ?? 'bg-gray-900/50 text-gray-400'}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">{new Date(entry.startedAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-gray-400">{entry.endedAt ? new Date(entry.endedAt).toLocaleString() : <span className="text-blue-400">Current</span>}</td>
                  <td className="py-2 text-gray-400">{formatDuration(entry.startedAt, entry.endedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="hover:text-gray-200 disabled:opacity-30">← Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="hover:text-gray-200 disabled:opacity-30">Next →</button>
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/ServerDetailPage.tsx
git commit -m "feat(server-dashboard): add ServerDetailPage with uptime trend chart"
```

---

## Task 10: Routing and navigation updates

**Files:**
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`
- Delete: `src/Vanalytics.Web/src/pages/ServerStatusPage.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the import and route for `ServerStatusPage`:

In imports (line 14), replace:
```typescript
import ServerStatusPage from './pages/ServerStatusPage'
```
with:
```typescript
import ServerStatusDashboard from './pages/ServerStatusDashboard'
import ServerDetailPage from './pages/ServerDetailPage'
```

Add `Navigate` to the react-router-dom import (line 2):
```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
```

In the routes section, make these changes:

**Critical: Route ordering.** The catch-all `/:server/:name` route (line 90) would match `/server/status`. Move it below the `<Route element={<Layout />}>` block so that explicit routes match first. React Router v6 uses ranking for sibling routes, but the catch-all is at a different nesting level, so it must come after.

Replace the **entire routes section** (lines 85-112) with:

```tsx
        <Routes>
          {/* Public: landing page (no layout) */}
          <Route path="/" element={<LandingPage />} />

          {/* OAuth callback */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* App pages with sidebar layout */}
          <Route element={<Layout />}>
            {/* Public server routes (no auth required) */}
            <Route path="/server/status" element={<ServerStatusDashboard />} />
            <Route path="/server/status/:name" element={<ServerDetailPage />} />
            <Route path="/server/clock" element={<VanadielClockPage />} />

            {/* Redirects for old routes */}
            <Route path="/servers" element={<Navigate to="/server/status" replace />} />
            <Route path="/clock" element={<Navigate to="/server/clock" replace />} />

            {/* Protected routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/characters" element={<ProtectedRoute><CharactersPage /></ProtectedRoute>} />
            <Route path="/characters/:id" element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/items" element={<ProtectedRoute><ItemDatabasePage /></ProtectedRoute>} />
            <Route path="/items/:id" element={<ProtectedRoute><ItemDetailPage /></ProtectedRoute>} />
            <Route path="/bazaar" element={<ProtectedRoute><BazaarActivityPage /></ProtectedRoute>} />
            <Route path="/setup" element={<ProtectedRoute><SetupGuidePage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/admin/data" element={<ProtectedRoute><AdminItemsPage /></ProtectedRoute>} />
            <Route path="/admin/saml" element={<ProtectedRoute><AdminSamlPage /></ProtectedRoute>} />
            <Route path="/npcs" element={<ProtectedRoute><NpcBrowserPage /></ProtectedRoute>} />
            <Route path="/debug/models" element={<ProtectedRoute><ModelDebugPage /></ProtectedRoute>} />
          </Route>

          {/* Public: shareable character profiles (MUST be after explicit routes to avoid catching /server/status) */}
          <Route path="/:server/:name" element={<PublicProfilePage />} />
        </Routes>
```

- [ ] **Step 2: Update Layout.tsx sidebar navigation**

In `Layout.tsx`, update the `getSection` function (lines 16-22) to match the new routes:

```typescript
function getSection(pathname: string): SectionName | null {
  if (pathname.startsWith('/items') || pathname.startsWith('/npcs')) return 'database'
  if (pathname.startsWith('/bazaar')) return 'economy'
  if (pathname.startsWith('/server/')) return 'server'
  if (pathname.startsWith('/admin')) return 'admin'
  return null
}
```

Update the Server sidebar section (lines 162-165) to use new routes:

```tsx
            <SidebarSection label="Server" icon={<Radio className="h-4 w-4 shrink-0" />} isOpen={openSection === 'server'} onToggle={() => toggleSection('server')}>
              <SidebarLink to="/server/status" end={false} label="Status" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/server/clock" label="Clock" icon={<Clock className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            </SidebarSection>
```

Note: `end={false}` on the Status link so that `/server/status/Asura` still highlights it.

- [ ] **Step 3: Delete the old ServerStatusPage.tsx**

Delete: `src/Vanalytics.Web/src/pages/ServerStatusPage.tsx`

- [ ] **Step 4: Verify the app compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Verify the backend still builds**

Run: `cd src/Vanalytics.Api && dotnet build`
Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Web/src/App.tsx src/Vanalytics.Web/src/components/Layout.tsx
git rm src/Vanalytics.Web/src/pages/ServerStatusPage.tsx
git commit -m "$(cat <<'EOF'
feat(server-dashboard): update routing and navigation

Routes: /server/status (public dashboard), /server/status/:name (detail),
/server/clock (public). Old /servers and /clock redirect. Sidebar
updated to match. Old ServerStatusPage removed.
EOF
)"
```

---

## Task 11: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd tests/Vanalytics.Api.Tests && dotnet test -v normal`
Expected: All tests pass (including new ServersControllerTests)

- [ ] **Step 2: Run the frontend dev server**

Run: `cd src/Vanalytics.Web && npx vite --open`

Manually verify:
- `/server/status` loads the dashboard with KPI cards, trend chart, heatmap, rankings, status grid, incidents
- Time range selector changes all widgets
- Clicking a server name in heatmap/rankings/status grid navigates to `/server/status/:name`
- `/server/status/:name` shows back link, uptime trend chart, timeline bar, event log
- `/servers` redirects to `/server/status`
- `/clock` redirects to `/server/clock`
- Sidebar "Server > Status" and "Server > Clock" links work
- No console errors

- [ ] **Step 3: Commit any fixes if needed**

Only if issues are found during verification.
