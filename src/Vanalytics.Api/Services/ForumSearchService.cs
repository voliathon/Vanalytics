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
                  FROM FREETEXTTABLE(ForumThread, Title, {0}) ft",
                query)
            .ToListAsync();

        // Find matching posts via body (excluding deleted)
        var postMatches = await _db.Database
            .SqlQueryRaw<PostMatch>(
                @"SELECT p.ThreadId, ft.[KEY] AS PostId, ft.RANK AS Rank
                  FROM FREETEXTTABLE(ForumPost, Body, {0}) ft
                  INNER JOIN ForumPost p ON p.Id = ft.[KEY]
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
