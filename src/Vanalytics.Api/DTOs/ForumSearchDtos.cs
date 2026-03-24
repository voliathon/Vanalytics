namespace Vanalytics.Api.DTOs;

public record ForumSearchResult(
    int ThreadId, string ThreadTitle, string ThreadSlug,
    string CategorySlug, string CategoryName,
    bool IsPinned, bool IsLocked,
    Guid AuthorId, string AuthorUsername, string? AuthorAvatarHash,
    string MatchSnippet,
    int ReplyCount, int VoteCount, DateTimeOffset LastPostAt);
