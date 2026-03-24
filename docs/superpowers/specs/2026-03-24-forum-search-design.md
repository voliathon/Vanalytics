# Forum Search (Phase 4a)

**Date:** 2026-03-24
**Phase:** 4a of 4 (4b: Image attachments, 4c: Notifications)

## Overview

Add full-text search to the forum using SQL Server's built-in full-text indexing. Search across thread titles and post bodies, return results grouped by thread with relevance-ranked snippets. The search logic is Vanalytics-specific (not in the reusable Soverance.Forum library).

## Database: Full-Text Catalog and Indexes

**Migration** creates:

1. A full-text catalog: `CREATE FULLTEXT CATALOG ForumFullTextCatalog AS DEFAULT`
2. Full-text index on `ForumThreads.Title` using the primary key index
3. Full-text index on `ForumPosts.Body` using the primary key index

```sql
CREATE FULLTEXT CATALOG ForumFullTextCatalog AS DEFAULT;

CREATE FULLTEXT INDEX ON ForumThreads(Title)
    KEY INDEX PK_ForumThreads
    WITH STOPLIST = SYSTEM;

CREATE FULLTEXT INDEX ON ForumPosts(Body)
    KEY INDEX PK_ForumPosts
    WITH STOPLIST = SYSTEM;
```

Since EF Core migrations don't natively support full-text index DDL, the migration uses `migrationBuilder.Sql()` to execute raw SQL.

**Note:** Full-text indexing is asynchronous — SQL Server populates the index in the background after creation. New posts are indexed automatically as they're inserted.

## Backend

### Search Service

**File:** `src/Vanalytics.Api/Services/ForumSearchService.cs`

A Vanalytics-specific service (NOT in the Soverance.Forum library) that uses raw SQL via EF Core's `FromSqlRaw()`. Uses `FREETEXTTABLE()` (not `FREETEXT()`) to get relevance rank values for ordering.

```csharp
public interface IForumSearchService
{
    Task<(List<ForumSearchResult> Results, bool HasMore)> SearchAsync(
        string query, int? afterRank = null, int? afterId = null, int limit = 25);
}
```

**Search logic:**
1. Query `ForumPosts` via `FREETEXTTABLE(ForumPosts, Body, @query)` joined with `ForumPosts WHERE IsDeleted = false` — returns matching post IDs with their thread IDs and rank values
2. Query `ForumThreads` via `FREETEXTTABLE(ForumThreads, Title, @query)` — returns matching thread IDs with rank values
3. Union the thread IDs from both sources, deduplicate, keeping the highest rank per thread
4. For each matched thread, extract a snippet from the highest-rank matching post (or the title if the title matched)
5. Join with thread metadata (category, author, reply count, vote count)
6. Order by rank desc, then thread ID desc as tiebreaker
7. Apply cursor-based pagination using compound cursor `(rank, threadId)`

**Snippet extraction:** For each matched thread, take the body of the highest-ranked matching post. Strip HTML tags via a simple regex (for display-only — not stored, edge cases like `&amp;` entities produce acceptable but imperfect snippets). Truncate to ~200 characters.

**`VoteCount`** is the aggregate sum of all post votes in the thread (same computation as `EnrichedThreadSummaryResponse.VoteCount`).

**Fallback for environments without full-text indexing:** If `FREETEXTTABLE()` fails (e.g., Testcontainer without full-text), fall back to `LIKE '%query%'` search on titles and post bodies. The fallback has no relevance ranking — results are ordered by `LastPostAt` desc instead. This makes the service work in both production and test environments.

### ForumSearchResult DTO

**File:** `src/Vanalytics.Api/DTOs/ForumSearchDtos.cs`

```csharp
public record ForumSearchResult(
    int ThreadId, string ThreadTitle, string ThreadSlug,
    string CategorySlug, string CategoryName,
    bool IsPinned, bool IsLocked,
    Guid AuthorId, string AuthorUsername, string? AuthorAvatarHash,
    string MatchSnippet,
    int ReplyCount, int VoteCount, DateTimeOffset LastPostAt);
```

### API Endpoint

`GET /api/forum/search?q={query}&afterRank={afterRank}&afterId={afterId}&limit={limit}`

- Public (no auth required)
- Returns `{ results: ForumSearchResult[], hasMore: boolean }`
- `q` is required — returns 400 if empty or fewer than 3 characters
- `q` is trimmed; minimum 3 characters (2-char terms are mostly noise words in the SQL Server system stoplist)
- If no results, returns 200 with empty `results` array
- `afterRank` + `afterId` form the compound cursor for pagination
- Results enriched with author info via `IForumAuthorResolver`
- Default limit: 25

Added to `ForumController` as a new endpoint.

### DI Registration

In `Program.cs`:
```csharp
builder.Services.AddScoped<IForumSearchService, ForumSearchService>();
```

## Frontend

### ForumSearchBar Component

**File:** `src/Vanalytics.Web/src/components/forum/ForumSearchBar.tsx`

Text input with search icon (Lucide `Search`). On Enter or click, navigates to `/forum/search?q={query}`. Pre-fills from URL `q` param when on the search page. Displayed on:
- `ForumCategoryListPage` — in the header area
- `ForumThreadListPage` — in the header area

### ForumSearchPage

**File:** `src/Vanalytics.Web/src/pages/ForumSearchPage.tsx`

Route: `/forum/search?q={query}`

- Reads `q` from URL search params
- Fetches `GET /api/forum/search?q={query}&limit=25`
- Results list: each result is a card showing:
  - Thread title (clickable → `/forum/{categorySlug}/{threadSlug}`)
  - Category badge (small pill with category name)
  - Match snippet (plain text, truncated)
  - Author avatar + username
  - Reply count, vote count, last activity
- Empty state: "No results found for '{query}'. Try a longer or more specific search term."
- "Load more" pagination — extracts `rank` and `id` from last result for cursor
- Loading spinner during fetch
- Breadcrumb: `Forum > Search results for "{query}"`

### TypeScript Types

Add to `api.ts`:

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

### Routing

Add to `App.tsx` in the forum routes section:
```tsx
<Route path="/forum/search" element={<ForumSearchPage />} />
```

This route must come before `/forum/:categorySlug` to avoid matching "search" as a category slug.

## File Summary

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/Vanalytics.Api/Services/ForumSearchService.cs` | IForumSearchService interface + implementation with LIKE fallback |
| Create | `src/Vanalytics.Api/DTOs/ForumSearchDtos.cs` | ForumSearchResult record |
| Create | `src/Vanalytics.Data/Migrations/[manual]_AddForumFullTextSearch.cs` | Full-text catalog + indexes migration (raw SQL) |
| Modify | `src/Vanalytics.Api/Controllers/ForumController.cs` | Add search endpoint |
| Modify | `src/Vanalytics.Api/Program.cs` | Register IForumSearchService |
| Create | `src/Vanalytics.Web/src/components/forum/ForumSearchBar.tsx` | Search input component |
| Create | `src/Vanalytics.Web/src/pages/ForumSearchPage.tsx` | Search results page |
| Modify | `src/Vanalytics.Web/src/types/api.ts` | Add search types |
| Modify | `src/Vanalytics.Web/src/App.tsx` | Add search route |
| Modify | `src/Vanalytics.Web/src/pages/ForumCategoryListPage.tsx` | Add ForumSearchBar |
| Modify | `src/Vanalytics.Web/src/pages/ForumThreadListPage.tsx` | Add ForumSearchBar |

## Testing

### Integration Tests

**File:** `tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs` (existing file, add new tests)

New test methods:
- `Search_ReturnsMatchingThreads` — create category + thread via API, search for keyword in title, verify result appears
- `Search_MatchesPostBody` — create thread with specific body text, search for body keyword
- `Search_EmptyQuery_Returns400` — empty/short query (<3 chars) returns 400
- `Search_NoResults_ReturnsEmptyList` — search for nonsense returns 200 with empty results
- `Search_ExcludesDeletedPosts` — create post, delete it, search for its content — should not appear

**Note:** The Testcontainer SQL Server image may not have full-text search enabled. The `ForumSearchService` uses the `LIKE` fallback automatically, so integration tests exercise the fallback path. This is acceptable because the fallback logic is the primary code path under test; the `FREETEXTTABLE()` path is identical except for the ranking SQL. Production full-text behavior can be verified via manual testing or a dedicated test environment.
