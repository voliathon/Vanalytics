# Server Status Analytics Dashboard

**Date:** 2026-03-23
**Phase:** 1 of 2 (Phase 2: PlayOnline maintenance/issue/update notice scraping)

## Overview

Replace the current `/servers` page with a business intelligence-style analytics dashboard at `/server/status`. The dashboard provides at-a-glance visibility into the historical uptime performance of the FFXI service — both as a whole and per individual server — using line charts, heatmaps, ranked tables, and summary statistics. The page is publicly accessible (no authentication required).

**Auth change:** The current `/servers` and `/clock` routes are wrapped in `<ProtectedRoute>`. The new `/server/status` and `/server/clock` routes move outside the `<ProtectedRoute>` wrapper to become public. The API endpoints in `ServersController` already have no `[Authorize]` attribute, so no backend auth changes are needed.

## Route Changes

| Old Route | New Route | Description |
|-----------|-----------|-------------|
| `/servers` | `/server/status` | BI dashboard (public) |
| — | `/server/status/:name` | Per-server detail view |
| (clock route) | `/server/clock` | Vana'diel clock |
| `/servers` | → redirect to `/server/status` | Preserve bookmarks |

Sidebar navigation updates to match the new `/server/*` route structure.

**Route ordering note:** The existing catch-all route `/:server/:name` (for public character profiles) could match `/server/status`. The new `/server/*` routes must be placed before the catch-all in the route config, or the catch-all pattern should be refined to avoid conflict.

## Page Layout

Top-down summary flow, single scrollable page. A global time range selector at the top drives all widgets.

**Time range options:** 24h, 48h, 7d, 30d, 90d, 365d, All Time

### Widget Order (top to bottom)

1. **KPI Cards Row** (4 cards, horizontal)
   - Service Health badge: Healthy (green) / Degraded (yellow) / Down (red)
   - Average uptime % over selected period
   - Best performing server (name + uptime %)
   - Worst performing server (name + uptime %)

2. **Uptime Trend Chart** (full width)
   - Recharts `AreaChart` plotting % of servers online at each time bucket
   - This is the "online percentage" metric (servers online / total servers), not the average per-server uptime
   - Gradient fill, tooltip with exact % and timestamp
   - Resolution adapts to range: 5-min (24h/48h), hourly (7d/30d), daily (90d+)

3. **Server Heatmap + Server Rankings** (side by side, 2:1 ratio)
   - Heatmap: CSS grid, server names on Y-axis, date columns on X-axis
     - Cell color: green (>99%), yellow (>95%), red (<=95%), gray (no data)
     - Daily buckets for ranges <= 90 days; weekly buckets (ISO weeks, average of daily uptimes) for ranges > 90 days
     - Partial weeks at range boundaries are included as-is
     - Clicking a server name navigates to detail view
   - Rankings: sorted table of all servers by uptime %
     - Color-coded percentages, clickable rows

4. **Current Status Grid + Recent Incidents** (side by side, 1:1 ratio)
   - Status Grid: condensed pills (server name + colored status dot)
     - Clicking navigates to detail view
   - Recent Incidents: feed of ~10 latest status changes across all servers
     - Status icon, server name, description, timestamp

### Responsive Behavior

- **Desktop:** side-by-side panels as described
- **Tablet/mobile:** all panels stack to single column; KPI cards become 2x2 grid

## Per-Server Detail View

Route: `/server/status/:name`

Preserves the existing per-server view with these elements:
- Back link: `← All Servers` returning to the dashboard
- **New: Per-server uptime trend chart** (same `UptimeTrendChart` component, single-server data) — sits above the existing timeline
- Existing status timeline bar (custom CSS)
- Existing event log table with pagination
- Date range selector (expanded from the current 7/30/90/365d to include 24h, 48h, and All Time)
- Uptime percentage display

## API Design

### New Endpoint: `GET /api/servers/analytics?days={days}`

Returns all dashboard data in a single call. Default `days=30`.

**"All Time" convention:** The frontend sends `days=0` to request all available data. The existing 365-day cap on the history endpoint is lifted for both endpoints when `days=0`.

**Response shape:**

```json
{
  "serviceHealth": {
    "status": "Healthy",
    "onlinePercent": 93.75,
    "uptimePercent": 99.7,
    "totalServers": 16,
    "onlineServers": 15
  },
  "uptimeTrend": [
    { "timestamp": "2026-03-22T00:00:00Z", "percent": 100.0 }
  ],
  "serverRankings": [
    { "name": "Asura", "uptimePercent": 99.98, "status": "Online" }
  ],
  "heatmap": [
    {
      "name": "Asura",
      "days": [
        { "date": "2026-03-22", "uptimePercent": 100.0, "dominantStatus": "Online" }  // dominantStatus used for tooltip text
      ]
    }
  ],
  "recentIncidents": [
    {
      "id": 48291,
      "serverName": "Odin",
      "status": "Maintenance",
      "startedAt": "2026-03-23T14:00:00Z",
      "endedAt": null,
      "duration": null
    }
  ]
}
```

**Field definitions for `serviceHealth`:**
- `onlinePercent`: snapshot — servers currently online / total servers (e.g., 15/16 = 93.75%)
- `uptimePercent`: historical — average uptime across all servers over the selected period
- `status`: derived from `onlinePercent` using thresholds below

**Health status thresholds (computed server-side):**
- **Healthy:** >= 90% of servers currently online
- **Degraded:** 50% to <90% online
- **Down:** < 50% online

**Uptime trend resolution:**
- 24h, 48h: 5-minute intervals
- 7d, 30d: hourly intervals
- 90d, 365d, All Time: daily intervals

### Extended Endpoint: `GET /api/servers/{name}/history?days={days}`

Existing endpoint extended to include trend data:

```json
{
  "name": "Asura",
  "status": "Online",
  "lastCheckedAt": "...",
  "days": 30,
  "uptimePercent": 99.98,
  "uptimeTrend": [
    { "timestamp": "2026-03-22T00:00:00Z", "percent": 100.0 }
  ],
  "history": [
    { "status": "Online", "startedAt": "...", "endedAt": "..." }
  ]
}
```

Same resolution rules as the analytics endpoint.

## Data Layer

**No new database tables.** All metrics are computed from:
- `GameServers` — current status, server list
- `ServerStatusChanges` — historical status records with start/end times

**Computation approach:**
- Uptime % = sum of online minutes / total minutes in range
- Heatmap cells = per-server, per-day uptime % from status change records
- Trend data = percentage of servers online at each time bucket
- Rankings = servers sorted by uptime % over selected range
- Recent incidents = latest N status change records across all servers, ordered by `StartedAt` desc

**Caching:** The analytics endpoint should use `IMemoryCache` with a 5-minute TTL (aligned to scraper interval) keyed by `days` parameter. This avoids recomputing expensive aggregations on every request.

## Frontend Components

| Component | Type | Chart Library |
|-----------|------|---------------|
| `ServerStatusDashboard.tsx` | Page (dashboard) | — |
| `ServerDetailPage.tsx` | Page (per-server) | — |
| `ServiceHealthCards.tsx` | Widget | — |
| `UptimeTrendChart.tsx` | Widget | Recharts `AreaChart` |
| `ServerHeatmap.tsx` | Widget | Custom CSS grid |
| `ServerRankings.tsx` | Widget | — |
| `CurrentStatusGrid.tsx` | Widget | — |
| `RecentIncidents.tsx` | Widget | — |

`UptimeTrendChart` is reused in both the dashboard (aggregate) and the detail view (single server).

## Error Handling

- **No data:** KPI cards show "No data", charts show placeholder message: "Collecting server data — check back soon."
- **Stale data:** If `lastCheckedAt` > 10 minutes ago, show warning banner: "Status data may be outdated — last check was X minutes ago."
- **All servers down:** Health badge shows "Down" (red), trend drops to 0%, heatmap goes red. No special handling beyond status colors.
- **Large ranges:** Heatmap uses weekly buckets beyond 90 days. Trend uses daily buckets beyond 30 days.

## URL State

The selected time range is persisted in the URL query string (e.g., `/server/status?days=7`) for shareability and browser back-button support, consistent with the existing URL state pattern used on item browsing pages. The detail view follows the same pattern: `/server/status/Asura?days=30`.

## Phase 2 (Future)

Scrape and display official PlayOnline notices:
- Server maintenance: `http://www.playonline.com/ff11us/info/list_mnt.shtml`
- Known issues: `http://www.playonline.com/ff11us/info/list_gen.shtml`
- Update notices: `http://www.playonline.com/ff11us/info/list_upd.shtml`

This data would overlay on the dashboard (e.g., maintenance windows annotated on the trend chart) and provide context for downtime periods. Phase 1 design accommodates this by keeping the dashboard layout extensible.
