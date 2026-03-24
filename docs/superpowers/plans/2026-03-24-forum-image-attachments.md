# Forum Image Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authenticated users to embed images in forum posts via the Tiptap editor, backed by Azure Blob Storage.

**Architecture:** Upload-on-insert — images upload immediately to a new `POST /api/forum/attachments` endpoint, which saves to Azure Blob Storage and returns a public URL. The Tiptap editor inserts the URL as an `<img>` tag. A `ForumAttachment` entity tracks metadata. Orphaned uploads are accepted; cleanup is deferred.

**Tech Stack:** .NET 9, Entity Framework Core, Azure.Storage.Blobs, React 19, Tiptap 3, TypeScript, Terraform

---

### Task 1: Terraform — Add forum-attachments blob container

**Files:**
- Modify: `IaC/terraform/azure/soverance/variables.tf:49-53`
- Modify: `IaC/terraform/azure/soverance/storage.tf:87-91`

- [ ] **Step 1: Add variable for container name**

In `variables.tf`, after the `vanalytics_item_images_container_name` variable (line 53), add:

```hcl
variable "vanalytics_forum_attachments_container_name" {
  type        = string
  default     = "forum-attachments"
  description = "Name of the blob container used for Vana'lytics forum image attachments."
}
```

- [ ] **Step 2: Add container resource**

In `storage.tf`, after the `vanalytics_item_images` container block (line 91), add:

```hcl
# -------------------------------------------------------
# Blob Container - Vana'lytics Forum Attachments
# -------------------------------------------------------
resource "azurerm_storage_container" "vanalytics_forum_attachments" {
  name                  = var.vanalytics_forum_attachments_container_name
  storage_account_id    = azurerm_storage_account.public.id
  container_access_type = "blob"
}
```

- [ ] **Step 3: Prompt user to run `terraform plan`**

Tell Scott to run: `cd IaC/terraform/azure/soverance && terraform plan`
Expected: Plan shows 1 new resource (`azurerm_storage_container.vanalytics_forum_attachments`).

- [ ] **Step 4: Commit**

```bash
git add IaC/terraform/azure/soverance/variables.tf IaC/terraform/azure/soverance/storage.tf
git commit -m "infra: add forum-attachments blob container"
```

---

### Task 2: ForumAttachment entity and EF configuration

**Files:**
- Create: `Common/src/Soverance.Forum/Models/ForumAttachment.cs`
- Create: `Common/src/Soverance.Forum/Configurations/ForumAttachmentConfiguration.cs`

- [ ] **Step 1: Create the entity model**

Create `Common/src/Soverance.Forum/Models/ForumAttachment.cs`:

```csharp
namespace Soverance.Forum.Models;

public class ForumAttachment
{
    public long Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string StoragePath { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public Guid UploadedBy { get; set; }
    public long? PostId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ForumPost? Post { get; set; }
}
```

- [ ] **Step 2: Create the EF configuration**

Create `Common/src/Soverance.Forum/Configurations/ForumAttachmentConfiguration.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Soverance.Forum.Models;

namespace Soverance.Forum.Configurations;

public class ForumAttachmentConfiguration : IEntityTypeConfiguration<ForumAttachment>
{
    public void Configure(EntityTypeBuilder<ForumAttachment> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.FileName).IsRequired().HasMaxLength(256);
        builder.Property(a => a.StoragePath).IsRequired().HasMaxLength(512);
        builder.Property(a => a.ContentType).IsRequired().HasMaxLength(64);
        builder.Property(a => a.FileSize).IsRequired();
        builder.Property(a => a.UploadedBy).IsRequired();
        builder.HasIndex(a => a.PostId);
        builder.HasIndex(a => a.UploadedBy);
        builder.HasOne(a => a.Post)
            .WithMany(p => p.Attachments)
            .HasForeignKey(a => a.PostId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
```

Note: The configuration is auto-discovered by `ApplyConfigurationsFromAssembly` in `ForumModelBuilderExtensions.cs` (line 10) since it's in the same assembly as `ForumCategory`.

- [ ] **Step 3: Add navigation property to ForumPost**

In `Common/src/Soverance.Forum/Models/ForumPost.cs`, add to the end of the class:

```csharp
public List<ForumAttachment> Attachments { get; set; } = [];
```

- [ ] **Step 4: Commit**

```bash
git add Common/src/Soverance.Forum/Models/ForumAttachment.cs Common/src/Soverance.Forum/Configurations/ForumAttachmentConfiguration.cs Common/src/Soverance.Forum/Models/ForumPost.cs
git commit -m "feat: add ForumAttachment entity and EF configuration"
```

---

### Task 3: EF Migration

**Files:**
- Create: `Vanalytics/src/Vanalytics.Data/Migrations/<timestamp>_AddForumAttachments.cs` (auto-generated)

- [ ] **Step 1: Generate migration**

From `Vanalytics/src/Vanalytics.Api/`, run:

```bash
dotnet ef migrations add AddForumAttachments --project ../Vanalytics.Data
```

- [ ] **Step 2: Review the generated migration**

Verify it creates a `ForumAttachments` table with all columns and the FK to `ForumPosts`. Check the index on `PostId` and `UploadedBy`.

- [ ] **Step 3: Test migration applies**

```bash
dotnet ef database update --project ../Vanalytics.Data
```

Expected: Migration applies without errors.

- [ ] **Step 4: Commit**

```bash
git add Vanalytics/src/Vanalytics.Data/Migrations/
git commit -m "feat: add ForumAttachments migration"
```

---

### Task 4: IForumAttachmentStore interface and implementations

**Files:**
- Create: `Vanalytics/src/Vanalytics.Api/Services/IForumAttachmentStore.cs`
- Create: `Vanalytics/src/Vanalytics.Api/Services/AzureBlobForumAttachmentStore.cs`
- Create: `Vanalytics/src/Vanalytics.Api/Services/LocalForumAttachmentStore.cs`

- [ ] **Step 1: Create the interface**

Create `Vanalytics/src/Vanalytics.Api/Services/IForumAttachmentStore.cs`:

```csharp
namespace Vanalytics.Api.Services;

public interface IForumAttachmentStore
{
    string BaseUrl { get; }
    Task<string> SaveAsync(string storagePath, Stream data, string contentType, CancellationToken ct = default);
    Task DeleteAsync(string storagePath, CancellationToken ct = default);
}
```

- [ ] **Step 2: Create the Azure implementation**

Create `Vanalytics/src/Vanalytics.Api/Services/AzureBlobForumAttachmentStore.cs`:

```csharp
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
```

- [ ] **Step 3: Create the local dev implementation**

Create `Vanalytics/src/Vanalytics.Api/Services/LocalForumAttachmentStore.cs`:

```csharp
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
```

- [ ] **Step 4: Register in DI and add serving route**

In `Vanalytics/src/Vanalytics.Api/Program.cs`:

After the item image store registration (line 69), add:

```csharp
// Forum attachment storage: Azure Blob in production, local filesystem in dev
if (!string.IsNullOrEmpty(builder.Configuration["AzureStorage:ConnectionString"]))
    builder.Services.AddSingleton<IForumAttachmentStore, AzureBlobForumAttachmentStore>();
else
    builder.Services.AddSingleton<IForumAttachmentStore, LocalForumAttachmentStore>();
```

After the item images serving route block (after line 140), add:

```csharp
// Serve forum attachments — redirect to Azure blob URL or serve from local disk
var azureAttachmentStore = app.Services.GetService<IForumAttachmentStore>() as AzureBlobForumAttachmentStore;
if (azureAttachmentStore != null)
{
    app.MapGet("/forum-attachments/{**path}", (string path) =>
        Results.Redirect($"{azureAttachmentStore.BaseUrl}/{path}", permanent: false));
}
else
{
    var forumAttachmentsPath = app.Configuration["ForumAttachments:BasePath"]
        ?? Path.Combine(AppContext.BaseDirectory, "forum-attachments");
    Directory.CreateDirectory(forumAttachmentsPath);
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(forumAttachmentsPath),
        RequestPath = "/forum-attachments"
    });
}
```

- [ ] **Step 5: Verify build**

```bash
cd Vanalytics/src/Vanalytics.Api && dotnet build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add Vanalytics/src/Vanalytics.Api/Services/IForumAttachmentStore.cs Vanalytics/src/Vanalytics.Api/Services/AzureBlobForumAttachmentStore.cs Vanalytics/src/Vanalytics.Api/Services/LocalForumAttachmentStore.cs Vanalytics/src/Vanalytics.Api/Program.cs
git commit -m "feat: add IForumAttachmentStore with Azure and local implementations"
```

---

### Task 5: Upload API endpoint with tests

**Files:**
- Modify: `Vanalytics/src/Vanalytics.Api/Controllers/ForumController.cs`
- Modify: `Vanalytics/tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs`

- [ ] **Step 1: Write failing tests for the upload endpoint**

Add these test methods to `ForumControllerTests.cs`:

```csharp
[Fact]
public async Task UploadAttachment_Unauthenticated_Returns401()
{
    var content = new MultipartFormDataContent();
    content.Add(new ByteArrayContent(new byte[] { 1, 2, 3 }), "file", "test.png");

    var resp = await _client.PostAsync("/api/forum/attachments", content);

    Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
}

[Fact]
public async Task UploadAttachment_NoFile_Returns400()
{
    var token = await RegisterAndGetTokenAsync("uploader@test.com", "uploader");
    var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    req.Content = new MultipartFormDataContent();

    var resp = await _client.SendAsync(req);

    Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
}

[Fact]
public async Task UploadAttachment_TooLarge_Returns400()
{
    var token = await RegisterAndGetTokenAsync("uploader2@test.com", "uploader2");
    var content = new MultipartFormDataContent();
    var fileContent = new ByteArrayContent(new byte[6 * 1024 * 1024]); // 6MB
    fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
    content.Add(fileContent, "file", "big.png");

    var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    req.Content = content;

    var resp = await _client.SendAsync(req);

    Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
}

[Fact]
public async Task UploadAttachment_InvalidType_Returns400()
{
    var token = await RegisterAndGetTokenAsync("uploader3@test.com", "uploader3");
    var content = new MultipartFormDataContent();
    var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3 });
    fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
    content.Add(fileContent, "file", "doc.pdf");

    var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    req.Content = content;

    var resp = await _client.SendAsync(req);

    Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
}

[Fact]
public async Task UploadAttachment_ValidImage_ReturnsIdAndUrl()
{
    var token = await RegisterAndGetTokenAsync("uploader4@test.com", "uploader4");
    var content = new MultipartFormDataContent();
    var fileContent = new ByteArrayContent(new byte[] { 137, 80, 78, 71 }); // PNG magic bytes
    fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
    content.Add(fileContent, "file", "screenshot.png");

    var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    req.Content = content;

    var resp = await _client.SendAsync(req);

    Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    var result = await resp.Content.ReadFromJsonAsync<JsonElement>();
    Assert.True(result.TryGetProperty("id", out _));
    Assert.True(result.TryGetProperty("url", out _));
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd Vanalytics && dotnet test --filter "UploadAttachment" -v n
```

Expected: All 5 tests fail (endpoint doesn't exist yet).

- [ ] **Step 3: Implement the upload endpoint**

Add to `ForumController.cs`, after the search endpoint and before the voting section. Add required usings and inject `IForumAttachmentStore`:

At the top of the controller class, add the field and update the constructor to accept `IForumAttachmentStore`:

```csharp
private readonly IForumAttachmentStore _attachmentStore;
```

Add `IForumAttachmentStore attachmentStore` to the constructor parameters and assign: `_attachmentStore = attachmentStore;`

Add the endpoint:

```csharp
// === Attachments (Authenticated) ===

private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
{
    "image/jpeg", "image/png", "image/gif", "image/webp"
};

private const long MaxFileSize = 5 * 1024 * 1024; // 5 MB

[Authorize]
[HttpPost("attachments")]
public async Task<IActionResult> UploadAttachment(IFormFile? file)
{
    if (file == null || file.Length == 0)
        return BadRequest(new { error = "No file provided." });

    if (file.Length > MaxFileSize)
        return BadRequest(new { error = "File size exceeds 5 MB limit." });

    if (!AllowedContentTypes.Contains(file.ContentType))
        return BadRequest(new { error = "File type not allowed. Accepted: JPEG, PNG, GIF, WebP." });

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (string.IsNullOrEmpty(ext)) ext = ".png";
    var storagePath = $"attachments/{Guid.NewGuid()}{ext}";

    using var stream = file.OpenReadStream();
    var url = await _attachmentStore.SaveAsync(storagePath, stream, file.ContentType);

    var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
    var attachment = new ForumAttachment
    {
        FileName = file.FileName,
        StoragePath = storagePath,
        ContentType = file.ContentType,
        FileSize = file.Length,
        UploadedBy = GetUserId(),
        CreatedAt = DateTimeOffset.UtcNow
    };
    db.Set<ForumAttachment>().Add(attachment);
    await db.SaveChangesAsync();

    return Ok(new { id = attachment.Id, url });
}
```

Add the required using statements at the top of the controller file:

```csharp
using Soverance.Forum.Models;
using Vanalytics.Data;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd Vanalytics && dotnet test --filter "UploadAttachment" -v n
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add Vanalytics/src/Vanalytics.Api/Controllers/ForumController.cs Vanalytics/tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs
git commit -m "feat: add POST /api/forum/attachments upload endpoint with tests"
```

---

### Task 6: Post attachment linking and image count validation

**Files:**
- Modify: `Vanalytics/src/Vanalytics.Api/Controllers/ForumController.cs`
- Modify: `Vanalytics/tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs`

- [ ] **Step 1: Write failing test for image count validation**

Add to `ForumControllerTests.cs`:

```csharp
[Fact]
public async Task CreatePost_TooManyImages_Returns400()
{
    var token = await RegisterAndGetTokenAsync("imgposter@test.com", "imgposter");

    // Create a category and thread first
    await PromoteToModeratorAsync("imgposter@test.com");
    var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories",
        token, new { name = "ImgTest", description = "Test", displayOrder = 1 }));
    var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
    var catSlug = cat.GetProperty("slug").GetString();

    var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads",
        token, new { title = "Image Thread", body = "First post" }));
    var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
    var threadId = thread.GetProperty("id").GetInt32();

    // Build body with 6 images (over limit of 5)
    var imgs = string.Join("", Enumerable.Range(0, 6).Select(i =>
        $"<img src=\"/forum-attachments/attachments/{Guid.NewGuid()}.png\">"));
    var body = $"<p>Too many images</p>{imgs}";

    var resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts",
        token, new { body }));

    Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd Vanalytics && dotnet test --filter "CreatePost_TooManyImages" -v n
```

Expected: Fails (no image count validation yet).

- [ ] **Step 3: Add image counting and attachment linking helpers**

Add a private helper method to `ForumController.cs`:

```csharp
private const int MaxImagesPerPost = 5;
private static readonly string AttachmentPathPrefix = "/forum-attachments/attachments/";

private static int CountForumImages(string html)
{
    var count = 0;
    var searchFrom = 0;
    while (true)
    {
        var idx = html.IndexOf(AttachmentPathPrefix, searchFrom, StringComparison.OrdinalIgnoreCase);
        if (idx < 0) break;
        count++;
        searchFrom = idx + AttachmentPathPrefix.Length;
    }
    return count;
}

private async Task LinkAttachmentsToPost(VanalyticsDbContext db, string html, long postId)
{
    var guids = new List<string>();
    var searchFrom = 0;
    while (true)
    {
        var idx = html.IndexOf(AttachmentPathPrefix, searchFrom, StringComparison.OrdinalIgnoreCase);
        if (idx < 0) break;
        var start = idx + AttachmentPathPrefix.Length;
        var end = html.IndexOfAny(new[] { '"', '\'', '>' }, start);
        if (end > start)
        {
            var fileName = html[start..end];
            guids.Add($"attachments/{fileName}");
        }
        searchFrom = start;
    }

    if (guids.Count > 0)
    {
        var attachments = await db.Set<ForumAttachment>()
            .Where(a => guids.Contains(a.StoragePath) && a.PostId == null)
            .ToListAsync();
        foreach (var a in attachments)
            a.PostId = postId;
        await db.SaveChangesAsync();
    }
}
```

Add `using Microsoft.EntityFrameworkCore;` if not already present.

- [ ] **Step 4: Add validation to CreatePost and EditPost**

Modify the `CreatePost` method — after the empty body check, add:

```csharp
if (CountForumImages(request.Body) > MaxImagesPerPost)
    return BadRequest(new { error = $"Posts cannot contain more than {MaxImagesPerPost} images." });
```

After `var post = await _forum.CreatePostAsync(...)`, before the return, add:

```csharp
if (post != null)
{
    var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
    await LinkAttachmentsToPost(db, request.Body, post.Id);
}
```

Apply the same image count check to `EditPost`, after the empty body check:

```csharp
if (CountForumImages(request.Body) > MaxImagesPerPost)
    return BadRequest(new { error = $"Posts cannot contain more than {MaxImagesPerPost} images." });
```

- [ ] **Step 5: Run tests**

```bash
cd Vanalytics && dotnet test --filter "Forum" -v n
```

Expected: All tests pass, including the new `CreatePost_TooManyImages` test.

- [ ] **Step 6: Commit**

```bash
git add Vanalytics/src/Vanalytics.Api/Controllers/ForumController.cs Vanalytics/tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs
git commit -m "feat: add image count validation and attachment-post linking"
```

---

### Task 7: Server-side HTML sanitization for image sources

**Files:**
- Modify: `Vanalytics/src/Vanalytics.Api/Controllers/ForumController.cs`
- Modify: `Vanalytics/tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs`

- [ ] **Step 1: Write failing test**

Add to `ForumControllerTests.cs`:

```csharp
[Fact]
public async Task CreatePost_ExternalImageStripped()
{
    var token = await RegisterAndGetTokenAsync("sanitize@test.com", "sanitize");

    await PromoteToModeratorAsync("sanitize@test.com");
    var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories",
        token, new { name = "SanitizeTest", description = "Test", displayOrder = 2 }));
    var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
    var catSlug = cat.GetProperty("slug").GetString();

    var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads",
        token, new { title = "Sanitize Thread", body = "First" }));
    var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
    var threadId = thread.GetProperty("id").GetInt32();

    var body = "<p>Check this</p><img src=\"https://evil.com/tracker.png\"><img src=\"/forum-attachments/attachments/good.png\">";

    var resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts",
        token, new { body }));

    Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
    var post = await resp.Content.ReadFromJsonAsync<JsonElement>();
    var resultBody = post.GetProperty("body").GetString()!;
    Assert.DoesNotContain("evil.com", resultBody);
    Assert.Contains("/forum-attachments/attachments/good.png", resultBody);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd Vanalytics && dotnet test --filter "CreatePost_ExternalImageStripped" -v n
```

Expected: Fails (external images not stripped yet).

- [ ] **Step 3: Add sanitization helper**

Add to `ForumController.cs`:

```csharp
private static string SanitizeImageSources(string html)
{
    var result = new System.Text.StringBuilder(html.Length);
    var pos = 0;
    while (pos < html.Length)
    {
        var imgStart = html.IndexOf("<img ", pos, StringComparison.OrdinalIgnoreCase);
        if (imgStart < 0)
        {
            result.Append(html, pos, html.Length - pos);
            break;
        }
        result.Append(html, pos, imgStart - pos);

        var imgEnd = html.IndexOf('>', imgStart);
        if (imgEnd < 0)
        {
            result.Append(html, pos, html.Length - pos);
            break;
        }
        imgEnd++;

        var tag = html[imgStart..imgEnd];
        var srcIdx = tag.IndexOf("src=\"", StringComparison.OrdinalIgnoreCase);
        if (srcIdx >= 0)
        {
            var srcStart = srcIdx + 5;
            var srcEnd = tag.IndexOf('"', srcStart);
            if (srcEnd > srcStart)
            {
                var src = tag[srcStart..srcEnd];
                if (src.StartsWith("/forum-attachments/", StringComparison.OrdinalIgnoreCase))
                {
                    result.Append(tag);
                }
                // else: drop the img tag (external source)
            }
        }

        pos = imgEnd;
    }
    return result.ToString();
}
```

- [ ] **Step 4: Apply sanitization in CreatePost and EditPost**

In `CreatePost`, after the image count check, before calling `_forum.CreatePostAsync`, sanitize the body:

```csharp
var sanitizedBody = SanitizeImageSources(request.Body);
var sanitizedRequest = new CreatePostRequest(sanitizedBody);
```

Then pass `sanitizedRequest` instead of `request` to `CreatePostAsync`.

Apply the same pattern in `EditPost`:

```csharp
var sanitizedBody = SanitizeImageSources(request.Body);
var sanitizedRequest = new UpdatePostRequest(sanitizedBody);
```

Pass `sanitizedRequest` to `UpdatePostAsync`.

Also apply sanitization in `CreateThread` (since the first post body comes from the thread creation request). Add the same pattern there.

- [ ] **Step 5: Run all forum tests**

```bash
cd Vanalytics && dotnet test --filter "Forum" -v n
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add Vanalytics/src/Vanalytics.Api/Controllers/ForumController.cs Vanalytics/tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs
git commit -m "feat: sanitize external image sources from forum post HTML"
```

---

### Task 8: Frontend — API client `uploadFile` helper

**Files:**
- Modify: `Vanalytics/src/Vanalytics.Web/src/api/client.ts`

- [ ] **Step 1: Add uploadFile function**

Add to the end of `client.ts` (before the `ApiError` class):

```typescript
export async function uploadFile<T>(
  path: string,
  file: File
): Promise<T> {
  const { accessToken } = getStoredTokens()

  const headers: Record<string, string> = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const formData = new FormData()
  formData.append('file', file)

  let res = await fetch(path, { method: 'POST', headers, body: formData })

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(path, { method: 'POST', headers, body: formData })
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(res.status, error.message ?? 'Upload failed')
  }

  return res.json()
}
```

Note: Do NOT set `Content-Type` header — the browser sets `multipart/form-data` with the boundary automatically.

- [ ] **Step 2: Commit**

```bash
git add Vanalytics/src/Vanalytics.Web/src/api/client.ts
git commit -m "feat: add uploadFile helper to API client"
```

---

### Task 9: Frontend — Install Tiptap Image extension

**Files:**
- Modify: `Vanalytics/src/Vanalytics.Web/package.json`

- [ ] **Step 1: Install the package**

```bash
cd Vanalytics/src/Vanalytics.Web && npm install @tiptap/extension-image
```

- [ ] **Step 2: Verify install**

Check `package.json` includes `@tiptap/extension-image`.

- [ ] **Step 3: Commit**

```bash
git add Vanalytics/src/Vanalytics.Web/package.json Vanalytics/src/Vanalytics.Web/package-lock.json
git commit -m "feat: install @tiptap/extension-image"
```

---

### Task 10: Frontend — Add image upload to ForumEditor

**Files:**
- Modify: `Vanalytics/src/Vanalytics.Web/src/components/forum/ForumEditor.tsx`

- [ ] **Step 1: Add Image extension and upload toolbar button**

Replace the full contents of `ForumEditor.tsx` with:

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { useRef, useState } from 'react'
import { uploadFile } from '../../api/client'
import {
  Bold, Italic, Strikethrough, Code, Heading2, Heading3,
  List, ListOrdered, Quote, CodeSquare, Link2, Undo2, Redo2, ImagePlus
} from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_IMAGES = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

interface Props {
  content?: string
  onChange?: (html: string) => void
  placeholder?: string
  editable?: boolean
}

function ToolbarButton({ onClick, active, disabled, children, title }: {
  onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled ? 'text-gray-600 cursor-not-allowed' :
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function countImages(editor: ReturnType<typeof useEditor>): number {
  if (!editor) return 0
  let count = 0
  editor.state.doc.descendants(node => {
    if (node.type.name === 'image') count++
  })
  return count
}

export default function ForumEditor({ content = '', onChange, placeholder = 'Write something...', editable = true }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2',
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (files?.length) {
          const imageFile = Array.from(files).find(f => ALLOWED_TYPES.includes(f.type))
          if (imageFile) {
            event.preventDefault()
            handleUpload(imageFile)
            return true
          }
        }
        return false
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
        if (files?.length) {
          const imageFile = Array.from(files).find(f => ALLOWED_TYPES.includes(f.type))
          if (imageFile) {
            event.preventDefault()
            handleUpload(imageFile)
            return true
          }
        }
        return false
      },
    },
  })

  const handleUpload = async (file: File) => {
    if (!editor) return
    setUploadError('')

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('File type not allowed. Use JPEG, PNG, GIF, or WebP.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('File is too large. Maximum size is 5 MB.')
      return
    }

    if (countImages(editor) >= MAX_IMAGES) {
      setUploadError(`Maximum ${MAX_IMAGES} images per post.`)
      return
    }

    setUploading(true)
    try {
      const result = await uploadFile<{ id: number; url: string }>('/api/forum/attachments', file)
      editor.chain().focus().setImage({ src: result.url }).run()
    } catch {
      setUploadError('Failed to upload image.')
    } finally {
      setUploading(false)
    }
  }

  if (!editor) return null

  if (!editable) {
    return <EditorContent editor={editor} />
  }

  const setLink = () => {
    const url = window.prompt('URL')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const imageCount = countImages(editor)
  const canAddImage = imageCount < MAX_IMAGES && !uploading

  const iconSize = 'h-4 w-4'

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="flex flex-wrap gap-0.5 border-b border-gray-700 p-1.5 bg-gray-900/50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline Code">
          <Code className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
          <ListOrdered className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          <Quote className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
          <CodeSquare className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Link">
          <Link2 className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => fileInputRef.current?.click()} disabled={!canAddImage} title={uploading ? 'Uploading...' : `Image (${imageCount}/${MAX_IMAGES})`}>
          <ImagePlus className={iconSize} />
        </ToolbarButton>
        <div className="w-px bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo2 className={iconSize} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      {uploadError && <p className="text-red-400 text-xs px-3 py-1">{uploadError}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd Vanalytics/src/Vanalytics.Web && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add Vanalytics/src/Vanalytics.Web/src/components/forum/ForumEditor.tsx
git commit -m "feat: add image upload to forum editor with drag-drop and paste support"
```

---

### Task 11: End-to-end smoke test

- [ ] **Step 1: Run all backend tests**

```bash
cd Vanalytics && dotnet test -v n
```

Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

```bash
cd Vanalytics/src/Vanalytics.Web && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test (local dev)**

Start the API server and verify:
1. Navigate to a forum thread
2. Click the image button in the editor toolbar
3. Select a PNG/JPEG file under 5 MB
4. Image uploads and appears inline in the editor
5. Submit the reply — image renders in the posted content
6. Try dragging an image into the editor — should upload and insert
7. Try pasting a screenshot — should upload and insert
8. Try uploading a 6th image — should show error message
9. Try uploading a .pdf — should show error message

- [ ] **Step 4: Commit any fixes discovered during smoke test**
