namespace Vanalytics.Api.Services;

public class LocalForumAttachmentStore : IForumAttachmentStore
{
    private readonly string _basePath;

    public LocalForumAttachmentStore(IConfiguration config)
    {
        _basePath = config["ForumAttachments:BasePath"] ?? Path.Combine(AppContext.BaseDirectory, "forum-attachments");
        Directory.CreateDirectory(_basePath);
    }

    public string BaseUrl => "/forum-attachments";

    public async Task<string> SaveAsync(string storagePath, Stream data, string contentType, CancellationToken ct = default)
    {
        var filePath = Path.Combine(_basePath, storagePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        using var fileStream = File.Create(filePath);
        await data.CopyToAsync(fileStream, ct);
        return $"/forum-attachments/{storagePath}";
    }

    public Task DeleteAsync(string storagePath, CancellationToken ct = default)
    {
        var filePath = Path.Combine(_basePath, storagePath.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(filePath)) File.Delete(filePath);
        return Task.CompletedTask;
    }
}
