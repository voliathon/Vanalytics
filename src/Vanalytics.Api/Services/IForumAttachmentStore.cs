namespace Vanalytics.Api.Services;

public interface IForumAttachmentStore
{
    string BaseUrl { get; }
    Task<string> SaveAsync(string storagePath, Stream data, string contentType, CancellationToken ct = default);
    Task DeleteAsync(string storagePath, CancellationToken ct = default);
}
