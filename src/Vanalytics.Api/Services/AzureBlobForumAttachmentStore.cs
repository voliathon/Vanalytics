using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Vanalytics.Api.Services;

public class AzureBlobForumAttachmentStore : IForumAttachmentStore
{
    private readonly BlobContainerClient _container;
    private readonly ILogger<AzureBlobForumAttachmentStore> _logger;
    private bool _containerEnsured;

    public AzureBlobForumAttachmentStore(IConfiguration config, ILogger<AzureBlobForumAttachmentStore> logger)
    {
        var connectionString = config["AzureStorage:ConnectionString"]!;
        var containerName = config["AzureStorage:ForumAttachmentsContainer"] ?? "forum-attachments";

        var blobServiceClient = new BlobServiceClient(connectionString);
        _container = blobServiceClient.GetBlobContainerClient(containerName);
        _logger = logger;
    }

    public string BaseUrl => _container.Uri.ToString().TrimEnd('/');

    private async Task EnsureContainerAsync(CancellationToken ct = default)
    {
        if (_containerEnsured) return;
        try
        {
            await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);
            _containerEnsured = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to ensure forum attachments blob container exists");
        }
    }

    public async Task<string> SaveAsync(string storagePath, Stream data, string contentType, CancellationToken ct = default)
    {
        await EnsureContainerAsync(ct);
        var blob = _container.GetBlobClient(storagePath);
        await blob.UploadAsync(data, new BlobHttpHeaders { ContentType = contentType }, cancellationToken: ct);
        return blob.Uri.ToString();
    }

    public async Task DeleteAsync(string storagePath, CancellationToken ct = default)
    {
        await EnsureContainerAsync(ct);
        var blob = _container.GetBlobClient(storagePath);
        await blob.DeleteIfExistsAsync(cancellationToken: ct);
    }
}
