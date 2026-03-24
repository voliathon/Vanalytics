# Forum Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-text search to the forum — SQL Server full-text indexes, a search service with LIKE fallback, a search API endpoint, and a frontend search UI with results page.

**Architecture:** A manual EF Core migration creates full-text catalog and indexes on thread titles and post bodies. A Vanalytics-specific `ForumSearchService` uses `FREETEXTTABLE()` with automatic `LIKE` fallback for environments without full-text indexing. A new search endpoint in `ForumController` returns enriched results. The frontend adds a `ForumSearchBar` component to category/thread list pages and a `ForumSearchPage` for results.

**Tech Stack:** .NET 10, EF Core 10, SQL Server Full-Text Search, React 19, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-24-forum-search-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/Vanalytics.Data/Migrations/[manual]_AddForumFullTextSearch.cs` | Full-text catalog + indexes |
| Create | `src/Vanalytics.Api/DTOs/ForumSearchDtos.cs` | ForumSearchResult record |
| Create | `src/Vanalytics.Api/Services/ForumSearchService.cs` | IForumSearchService + implementation with LIKE fallback |
| Modify | `src/Vanalytics.Api/Controllers/ForumController.cs` | Add search endpoint + inject IForumSearchService |
| Modify | `src/Vanalytics.Api/Program.cs` | Register IForumSearchService |
| Modify | `src/Vanalytics.Web/src/types/api.ts` | Add search types |
| Create | `src/Vanalytics.Web/src/components/forum/ForumSearchBar.tsx` | Search input component |
| Create | `src/Vanalytics.Web/src/pages/ForumSearchPage.tsx` | Search results page |
| Modify | `src/Vanalytics.Web/src/App.tsx` | Add search route |
| Modify | `src/Vanalytics.Web/src/pages/ForumCategoryListPage.tsx` | Add search bar |
| Modify | `src/Vanalytics.Web/src/pages/ForumThreadListPage.tsx` | Add search bar |
| Modify | `tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs` | Add search tests |

---

## Task 1: Migration, DTO, and search service

**Files:**
- Create: `src/Vanalytics.Api/DTOs/ForumSearchDtos.cs`
- Create: `src/Vanalytics.Api/Services/ForumSearchService.cs`
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Create ForumSearchDtos**

Create `src/Vanalytics.Api/DTOs/ForumSearchDtos.cs`:

```csharp
namespace Vanalytics.Api.DTOs;

public record ForumSearchResult(
    int ThreadId, string ThreadTitle, string ThreadSlug,
    string CategorySlug, string CategoryName,
    bool IsPinned, bool IsLocked,
    Guid AuthorId, string AuthorUsername, string? AuthorAvatarHash,
    string MatchSnippet,
    int ReplyCount, int VoteCount, DateTimeOffset LastPostAt);
```

- [ ] **Step 2: Create ForumSearchService**

Create `src/Vanalytics.Api/Services/ForumSearchService.cs`:

```csharp
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Soverance.Forum.Models;
using Soverance.Forum.Services;
using Vanalytics.Api.DTOs;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public interface IForumSearchService
{
    Task<(List<ForumSearchResult> Results, bool HasMore)> SearchAsync(
        string query, int? afterRank = null, int? afterId = null, int limit = 25);
}

public partial class ForumSearchService : IForumSearchService
{
    private readonly VanalyticsDbContext _db;
    private readonly IForumAuthorResolver _authors;

    public ForumSearchService(VanalyticsDbContext db, IForumAuthorResolver authors)
    {
        _db = db;
        _authors = authors;
    }

    public async Task<(List<ForumSearchResult> Results, bool HasMore)> SearchAsync(
        string query, int? afterRank = null, int? afterId = null, int limit = 25)
    {
        try
        {
            return await SearchWithFullTextAsync(query, afterRank, afterId, limit);
        }
        catch
        {
            // Fallback to LIKE search if full-text is not available
            return await SearchWithLikeAsync(query, afterId, limit);
        }
    }

    private async Task<(List<ForumSearchResult> Results, bool HasMore)> SearchWithFullTextAsync(
        string query, int? afterRank, int? afterId, int limit)
    {
        // Find matching threads via title
        var titleMatches = await _db.Database
            .SqlQueryRaw<ThreadMatch>(
                @"SELECT ft.[KEY] AS ThreadId, ft.RANK AS Rank
                  FROM FREETEXTTABLE(ForumThreads, Title, {0}) ft",
                query)
            .ToListAsync();

        // Find matching posts via body (excluding deleted)
        var postMatches = await _db.Database
            .SqlQueryRaw<PostMatch>(
                @"SELECT p.ThreadId, ft.[KEY] AS PostId, ft.RANK AS Rank
                  FROM FREETEXTTABLE(ForumPosts, Body, {0}) ft
                  INNER JOIN ForumPosts p ON p.Id = ft.[KEY]
                  WHERE p.IsDeleted = 0",
                query)
            .ToListAsync();

        // Group by thread, keep highest rank per thread
        var threadRanks = new Dictionary<int, (int Rank, long? BestPostId)>();

        foreach (var m in titleMatches)
        {
            threadRanks[m.ThreadId] = (m.Rank, null);
        }

        foreach (var m in postMatches)
        {
            if (!threadRanks.TryGetValue(m.ThreadId, out var existing) || m.Rank > existing.Rank)
            {
                threadRanks[m.ThreadId] = (m.Rank, m.PostId);
            }
        }

        // Apply cursor pagination
        var ranked = threadRanks
            .OrderByDescending(kv => kv.Value.Rank)
            .ThenByDescending(kv => kv.Key)
            .AsEnumerable();

        if (afterRank != null && afterId != null)
        {
            ranked = ranked.Where(kv =>
                kv.Value.Rank < afterRank.Value ||
                (kv.Value.Rank == afterRank.Value && kv.Key < afterId.Value));
        }

        var page = ranked.Take(limit + 1).ToList();
        var hasMore = page.Count > limit;
        if (hasMore) page = page.Take(limit).ToList();

        if (page.Count == 0) return ([], false);

        // Load thread data
        var threadIds = page.Select(kv => kv.Key).ToList();
        var threads = await _db.Set<ForumThread>()
            .Include(t => t.Category)
            .Where(t => threadIds.Contains(t.Id))
            .ToListAsync();

        // Load best matching post bodies for snippets
        var bestPostIds = page
            .Where(kv => kv.Value.BestPostId != null)
            .Select(kv => kv.Value.BestPostId!.Value)
            .ToList();

        var bestPosts = bestPostIds.Count > 0
            ? await _db.Set<ForumPost>()
                .Where(p => bestPostIds.Contains(p.Id))
                .Select(p => new { p.Id, p.ThreadId, p.Body })
                .ToListAsync()
            : [];

        // Load reply counts and vote counts
        var replyCounts = await _db.Set<ForumPost>()
            .Where(p => threadIds.Contains(p.ThreadId))
            .GroupBy(p => p.ThreadId)
            .Select(g => new { ThreadId = g.Key, Count = g.Count() - 1 })
            .ToListAsync();

        var voteCounts = await _db.Set<ForumVote>()
            .Where(v => threadIds.Contains(v.Post.ThreadId))
            .GroupBy(v => v.Post.ThreadId)
            .Select(g => new { ThreadId = g.Key, Count = g.Count() })
            .ToListAsync();

        var replyMap = replyCounts.ToDictionary(x => x.ThreadId, x => x.Count);
        var voteMap = voteCounts.ToDictionary(x => x.ThreadId, x => x.Count);

        // Resolve authors
        var authorIds = threads.Select(t => t.AuthorId).Distinct();
        var authors = await _authors.ResolveAuthorsAsync(authorIds);

        // Build results in rank order
        var results = page.Select(kv =>
        {
            var thread = threads.First(t => t.Id == kv.Key);
            var author = authors.GetValueOrDefault(thread.AuthorId);
            var bestPost = bestPosts.FirstOrDefault(p => p.ThreadId == thread.Id);
            var snippet = bestPost != null
                ? TruncateSnippet(StripHtml(bestPost.Body))
                : TruncateSnippet(thread.Title);

            return new ForumSearchResult(
                thread.Id, thread.Title, thread.Slug,
                thread.Category.Slug, thread.Category.Name,
                thread.IsPinned, thread.IsLocked,
                thread.AuthorId,
                author?.Username ?? "[deleted]",
                author?.AvatarHash,
                snippet,
                replyMap.GetValueOrDefault(thread.Id),
                voteMap.GetValueOrDefault(thread.Id),
                thread.LastPostAt);
        }).ToList();

        return (results, hasMore);
    }

    private async Task<(List<ForumSearchResult> Results, bool HasMore)> SearchWithLikeAsync(
        string query, int? afterId, int limit)
    {
        var pattern = $"%{query}%";

        // Find threads matching by title or post body
        var matchingByTitle = _db.Set<ForumThread>()
            .Where(t => EF.Functions.Like(t.Title, pattern))
            .Select(t => t.Id);

        var matchingByPost = _db.Set<ForumPost>()
            .Where(p => !p.IsDeleted && EF.Functions.Like(p.Body, pattern))
            .Select(p => p.ThreadId);

        var threadIds = await matchingByTitle
            .Union(matchingByPost)
            .Distinct()
            .ToListAsync();

        // Load threads with cursor pagination
        var threadsQuery = _db.Set<ForumThread>()
            .Include(t => t.Category)
            .Where(t => threadIds.Contains(t.Id));

        if (afterId != null)
            threadsQuery = threadsQuery.Where(t => t.Id < afterId.Value);

        var threads = await threadsQuery
            .OrderByDescending(t => t.LastPostAt)
            .ThenByDescending(t => t.Id)
            .Take(limit + 1)
            .ToListAsync();

        var hasMore = threads.Count > limit;
        if (hasMore) threads = threads.Take(limit).ToList();

        if (threads.Count == 0) return ([], false);

        var pageThreadIds = threads.Select(t => t.Id).ToList();

        // Load snippets from first matching post per thread
        var snippets = new Dictionary<int, string>();
        foreach (var tid in pageThreadIds)
        {
            var post = await _db.Set<ForumPost>()
                .Where(p => p.ThreadId == tid && !p.IsDeleted && EF.Functions.Like(p.Body, pattern))
                .Select(p => new { p.Body })
                .FirstOrDefaultAsync();
            snippets[tid] = post != null ? TruncateSnippet(StripHtml(post.Body)) : "";
        }

        // Reply counts and vote counts
        var replyCounts = await _db.Set<ForumPost>()
            .Where(p => pageThreadIds.Contains(p.ThreadId))
            .GroupBy(p => p.ThreadId)
            .Select(g => new { ThreadId = g.Key, Count = g.Count() - 1 })
            .ToListAsync();

        var voteCounts = await _db.Set<ForumVote>()
            .Where(v => pageThreadIds.Contains(v.Post.ThreadId))
            .GroupBy(v => v.Post.ThreadId)
            .Select(g => new { ThreadId = g.Key, Count = g.Count() })
            .ToListAsync();

        var replyMap = replyCounts.ToDictionary(x => x.ThreadId, x => x.Count);
        var voteMap = voteCounts.ToDictionary(x => x.ThreadId, x => x.Count);

        // Resolve authors
        var authorIds = threads.Select(t => t.AuthorId).Distinct();
        var authors = await _authors.ResolveAuthorsAsync(authorIds);

        var results = threads.Select(t =>
        {
            var author = authors.GetValueOrDefault(t.AuthorId);
            var snippet = snippets.GetValueOrDefault(t.Id, TruncateSnippet(t.Title));

            return new ForumSearchResult(
                t.Id, t.Title, t.Slug,
                t.Category.Slug, t.Category.Name,
                t.IsPinned, t.IsLocked,
                t.AuthorId,
                author?.Username ?? "[deleted]",
                author?.AvatarHash,
                snippet,
                replyMap.GetValueOrDefault(t.Id),
                voteMap.GetValueOrDefault(t.Id),
                t.LastPostAt);
        }).ToList();

        return (results, hasMore);
    }

    private static string StripHtml(string html)
    {
        return HtmlTagRegex().Replace(html, "").Trim();
    }

    private static string TruncateSnippet(string text, int maxLength = 200)
    {
        if (text.Length <= maxLength) return text;
        return text[..maxLength].TrimEnd() + "...";
    }

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex HtmlTagRegex();

    // Helper records for raw SQL queries
    private record ThreadMatch(int ThreadId, int Rank);
    private record PostMatch(int ThreadId, long PostId, int Rank);
}
```

- [ ] **Step 3: Register in Program.cs**

Read `src/Vanalytics.Api/Program.cs`, find the forum DI registrations (the `AddForumServices()` line), and add after it:

```csharp
builder.Services.AddScoped<IForumSearchService, ForumSearchService>();
```

Add the using if needed: `using Vanalytics.Api.Services;` (likely already present).

- [ ] **Step 4: Verify backend builds**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build`
Expected: Build succeeded

- [ ] **Step 5: Commit**

---

## Task 2: EF Core migration for full-text indexes

**Files:**
- Create: Manual migration file under `src/Vanalytics.Data/Migrations/`

- [ ] **Step 1: Generate a blank migration**

Run: `cd C:/Git/soverance/Vanalytics && dotnet ef migrations add AddForumFullTextSearch --project src/Vanalytics.Data --startup-project src/Vanalytics.Api`

- [ ] **Step 2: Edit the migration to add full-text SQL**

The generated migration will be empty (no model changes). Edit the `Up()` method to add:

```csharp
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.Sql("CREATE FULLTEXT CATALOG ForumFullTextCatalog AS DEFAULT;");
    migrationBuilder.Sql(
        @"CREATE FULLTEXT INDEX ON ForumThreads(Title)
          KEY INDEX PK_ForumThreads
          WITH STOPLIST = SYSTEM;");
    migrationBuilder.Sql(
        @"CREATE FULLTEXT INDEX ON ForumPosts(Body)
          KEY INDEX PK_ForumPosts
          WITH STOPLIST = SYSTEM;");
}

protected override void Down(MigrationBuilder migrationBuilder)
{
    migrationBuilder.Sql("DROP FULLTEXT INDEX ON ForumPosts;");
    migrationBuilder.Sql("DROP FULLTEXT INDEX ON ForumThreads;");
    migrationBuilder.Sql("DROP FULLTEXT CATALOG ForumFullTextCatalog;");
}
```

- [ ] **Step 3: Verify build**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

---

## Task 3: Search endpoint in ForumController

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/ForumController.cs`

- [ ] **Step 1: Add IForumSearchService to the controller**

Read the controller file. Update the constructor to accept `IForumSearchService`:

```csharp
private readonly IForumService _forum;
private readonly IForumAuthorResolver _authors;
private readonly IForumSearchService _search;

public ForumController(IForumService forum, IForumAuthorResolver authors, IForumSearchService search)
{
    _forum = forum;
    _authors = authors;
    _search = search;
}
```

- [ ] **Step 2: Add the search endpoint**

Add this method to the controller, in the public endpoints section (before the authenticated endpoints):

```csharp
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string? q = null,
        [FromQuery] int? afterRank = null,
        [FromQuery] int? afterId = null,
        [FromQuery] int limit = 25)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 3)
            return BadRequest(new { error = "Search query must be at least 3 characters." });

        var (results, hasMore) = await _search.SearchAsync(q.Trim(), afterRank, afterId, limit);
        return Ok(new { results, hasMore });
    }
```

- [ ] **Step 3: Verify build**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

---

## Task 4: Frontend — types, search bar, search page

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`
- Create: `src/Vanalytics.Web/src/components/forum/ForumSearchBar.tsx`
- Create: `src/Vanalytics.Web/src/pages/ForumSearchPage.tsx`

- [ ] **Step 1: Add search types to api.ts**

Read the file, then add after the existing forum types:

```typescript
export interface ForumSearchResult {
  threadId: number
  threadTitle: string
  threadSlug: string
  categorySlug: string
  categoryName: string
  isPinned: boolean
  isLocked: boolean
  authorId: string
  authorUsername: string
  authorAvatarHash: string | null
  matchSnippet: string
  replyCount: number
  voteCount: number
  lastPostAt: string
}

export interface PaginatedSearchResults {
  results: ForumSearchResult[]
  hasMore: boolean
}
```

- [ ] **Step 2: Create ForumSearchBar**

Create `src/Vanalytics.Web/src/components/forum/ForumSearchBar.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'

export default function ForumSearchBar() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length >= 3) {
      navigate(`/forum/search?q=${encodeURIComponent(trimmed)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search forum..."
        className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </form>
  )
}
```

- [ ] **Step 3: Create ForumSearchPage**

Create `src/Vanalytics.Web/src/pages/ForumSearchPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Pin, Lock } from 'lucide-react'
import { api } from '../api/client'
import type { ForumSearchResult, PaginatedSearchResults } from '../types/api'
import UserAvatar from '../components/UserAvatar'
import ForumSearchBar from '../components/forum/ForumSearchBar'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ForumSearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [results, setResults] = useState<ForumSearchResult[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchResults = async (append = false) => {
    if (!query || query.length < 3) return
    setLoading(true)
    setError('')
    try {
      const last = append && results.length > 0 ? results[results.length - 1] : null
      const params = new URLSearchParams({ q: query, limit: '25' })
      if (last) {
        params.set('afterId', String(last.threadId))
      }
      const data = await api<PaginatedSearchResults>(`/api/forum/search?${params}`)
      setResults(prev => append ? [...prev, ...data.results] : data.results)
      setHasMore(data.hasMore)
    } catch {
      setError('Search failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setResults([])
    fetchResults()
  }, [query])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link to="/forum" className="hover:text-blue-400">Forum</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-300">Search results for "{query}"</span>
      </div>

      <div className="max-w-lg">
        <ForumSearchBar />
      </div>

      {loading && results.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      {error && <p className="text-red-400 text-center py-10">{error}</p>}

      {!loading && results.length === 0 && query.length >= 3 && (
        <p className="text-gray-500 text-center py-10">
          No results found for "{query}". Try a longer or more specific search term.
        </p>
      )}

      <div className="space-y-3">
        {results.map(r => (
          <Link
            key={r.threadId}
            to={`/forum/${r.categorySlug}/${r.threadSlug}`}
            className="block rounded-lg border border-gray-800 bg-gray-900 p-4 hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              {r.isPinned && <Pin className="h-3.5 w-3.5 text-blue-400" />}
              {r.isLocked && <Lock className="h-3.5 w-3.5 text-amber-400" />}
              <h3 className="text-sm font-semibold text-gray-100">{r.threadTitle}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-2 line-clamp-2">{r.matchSnippet}</p>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="rounded bg-gray-800 px-2 py-0.5 text-gray-400">{r.categoryName}</span>
              <div className="flex items-center gap-1">
                <UserAvatar username={r.authorUsername} size="sm" />
                <span>{r.authorUsername}</span>
              </div>
              <span>{r.replyCount} replies</span>
              <span>{r.voteCount} votes</span>
              <span>{timeAgo(r.lastPostAt)}</span>
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchResults(true)}
            disabled={loading}
            className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 5: Commit**

---

## Task 5: Routing and search bar integration

**Files:**
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ForumCategoryListPage.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ForumThreadListPage.tsx`

- [ ] **Step 1: Add search route to App.tsx**

Read the file. Add the import:
```typescript
import ForumSearchPage from './pages/ForumSearchPage'
```

Add the search route BEFORE the `:categorySlug` route (around line 124). The forum routes should become:
```tsx
            {/* Public forum routes */}
            <Route path="/forum" element={<ForumCategoryListPage />} />
            <Route path="/forum/search" element={<ForumSearchPage />} />
            <Route path="/forum/:categorySlug" element={<ForumThreadListPage />} />
            <Route path="/forum/:categorySlug/new" element={<ProtectedRoute><ForumNewThreadPage /></ProtectedRoute>} />
            <Route path="/forum/:categorySlug/:threadSlug" element={<ForumThreadPage />} />
```

- [ ] **Step 2: Add ForumSearchBar to ForumCategoryListPage**

Read `src/Vanalytics.Web/src/pages/ForumCategoryListPage.tsx`. Add import:
```typescript
import ForumSearchBar from '../components/forum/ForumSearchBar'
```

Add `<ForumSearchBar />` in the header area — place it after the page title/heading, wrapped in a max-width container:
```tsx
<div className="max-w-lg mb-4">
  <ForumSearchBar />
</div>
```

- [ ] **Step 3: Add ForumSearchBar to ForumThreadListPage**

Same pattern — read the file, add import, add `<ForumSearchBar />` in the header area after the category name/description.

- [ ] **Step 4: Verify compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 5: Commit**

---

## Task 6: Integration tests

**Files:**
- Modify: `tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs`

- [ ] **Step 1: Add search tests**

Read the existing test file. Add these test methods:

```csharp
    [Fact]
    public async Task Search_EmptyQuery_Returns400()
    {
        var resp = await _client.GetAsync("/api/forum/search?q=ab");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Search_NoResults_ReturnsEmptyList()
    {
        var resp = await _client.GetAsync("/api/forum/search?q=zzzznonexistent");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, json.GetProperty("results").GetArrayLength());
        Assert.False(json.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public async Task Search_MatchesThreadTitle()
    {
        var modToken = await GetModeratorTokenAsync("search1@test.com", "searchmod1");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories", modToken,
                new CreateCategoryRequest("SearchCat", "")));

        var memberToken = await RegisterAndGetTokenAsync("searchmem1@test.com", "searchmem1");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories/searchcat/threads", memberToken,
                new CreateThreadRequest("UniqueSearchableTitle", "Some body content")));

        // The LIKE fallback is used in tests (no full-text in Testcontainer)
        var resp = await _client.GetAsync("/api/forum/search?q=UniqueSearchableTitle");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var results = json.GetProperty("results");
        Assert.True(results.GetArrayLength() > 0);
        Assert.Equal("UniqueSearchableTitle", results[0].GetProperty("threadTitle").GetString());
    }

    [Fact]
    public async Task Search_MatchesPostBody()
    {
        var modToken = await GetModeratorTokenAsync("search2@test.com", "searchmod2");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories", modToken,
                new CreateCategoryRequest("SearchCat2", "")));

        var memberToken = await RegisterAndGetTokenAsync("searchmem2@test.com", "searchmem2");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories/searchcat2/threads", memberToken,
                new CreateThreadRequest("Normal Title", "VeryUniqueBodyContent12345")));

        var resp = await _client.GetAsync("/api/forum/search?q=VeryUniqueBodyContent12345");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.GetProperty("results").GetArrayLength() > 0);
    }
```

- [ ] **Step 2: Run the tests**

Run: `cd C:/Git/soverance/Vanalytics/tests/Vanalytics.Api.Tests && dotnet test --filter "ForumControllerTests" -v normal`
Expected: All tests pass (including the new search tests, which use the LIKE fallback)

- [ ] **Step 3: Commit**

---

## Task 7: Verification

- [ ] **Step 1: Full frontend compile**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

- [ ] **Step 2: Full backend build**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build --no-restore`

- [ ] **Step 3: Forum library tests**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/tests/Soverance.Forum.Tests && dotnet test -v minimal`

- [ ] **Step 4: Manual testing checklist**

- `/forum` and `/forum/:categorySlug` show search bar
- Typing a query and pressing Enter navigates to `/forum/search?q=...`
- Search results page shows matching threads with snippets
- Clicking a result navigates to the thread
- Empty search shows "No results" message
- Short query (<3 chars) shows appropriate feedback
- "Load more" works when there are many results
