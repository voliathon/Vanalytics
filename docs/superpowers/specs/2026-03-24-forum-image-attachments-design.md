# Forum Image Attachments — Design Spec

## Overview

Add inline image support to forum posts. Users embed images directly in the Tiptap editor; images upload immediately to Azure Blob Storage and render as `<img>` tags in the post HTML body.

## Approach

**Upload-on-insert:** When a user selects/drops/pastes an image, the frontend uploads it immediately to `POST /api/forum/attachments`, receives the public blob URL, and inserts an `<img>` tag into the editor. The post body already stores HTML, so no schema changes to `ForumPost` are needed.

Orphaned uploads (user abandons draft) are accepted as a trade-off for simplicity. Blob storage is cheap; a cleanup job can be added later if needed.

## Data Model

### New Entity: `ForumAttachment`

Located in `Soverance.Forum/Models/`.

| Column | Type | Notes |
|--------|------|-------|
| Id | long | PK, identity |
| FileName | string | Original filename from upload |
| StoragePath | string | Blob path, e.g. `attachments/{guid}.png` |
| ContentType | string | MIME type |
| FileSize | long | Bytes |
| UploadedBy | Guid | Uploading user's ID |
| PostId | long? | Nullable — linked when post is created/edited, null if orphaned |
| CreatedAt | DateTimeOffset | Upload timestamp |

GUID-based storage paths prevent filename collisions and URL guessing.

### Post Linking

When a post is created or edited, parse the HTML body for `<img>` tags pointing to the `forum-attachments` container. Set `PostId` on matching `ForumAttachment` records to link them for future cleanup tracking.

No changes to the `ForumPost` entity.

## API

### `POST /api/forum/attachments`

- **Auth:** `[Authorize]` (any authenticated user)
- **Request:** `multipart/form-data` with single `IFormFile` field
- **Validation:**
  - File size ≤ 5 MB
  - Content type: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- **Response:** `{ id: long, url: string }`
- **Behavior:** Saves file to Azure Blob container `forum-attachments` at path `attachments/{guid}.{ext}`, creates `ForumAttachment` record, returns public URL.

### Post creation/edit changes

- Max 5 images per post, enforced by counting `<img>` tags in the submitted body that point to the forum-attachments container.
- Link `ForumAttachment.PostId` to matching records on save.

## Storage Layer

### Interface: `IForumAttachmentStore`

Located in `Vanalytics.Api/Services/`, alongside `IItemImageStore`.

- `SaveAsync(string storagePath, Stream data, string contentType, CancellationToken ct)` → returns public URL
- `DeleteAsync(string storagePath, CancellationToken ct)`

### Implementation: `AzureBlobForumAttachmentStore`

- Same `AzureStorage:ConnectionString` as item icons
- Config key: `AzureStorage:ForumAttachmentsContainer` (defaults to `forum-attachments`)
- Container created with `PublicAccessType.Blob` (public read, no listing)

### Dev fallback: `LocalForumAttachmentStore`

- Saves to local filesystem at `ForumAttachments:BasePath`
- Served via static file route

### Serving route

`/forum-attachments/{**path}` in `Program.cs` — proxies to blob URL or local filesystem, same pattern as `/item-images/{**path}`.

### Terraform

Add `azurerm_storage_container` resource for `forum-attachments` in the existing storage account at `IaC/terraform/azure/soverance`.

## Frontend

### Tiptap Editor Changes (`ForumEditor.tsx`)

- Add `@tiptap/extension-image` — configured with `inline: false`, `allowBase64: false`
- New toolbar button with Lucide `ImagePlus` icon
- On click: open file input accepting `image/jpeg,image/png,image/gif,image/webp`
- Upload via `FormData` to `POST /api/forum/attachments`
- On success: `editor.chain().setImage({ src: url }).run()`
- Loading indicator while uploading (disable button or show placeholder)

### Drag-and-drop / Paste

Intercept dropped and pasted images via Tiptap's upload handler. Route through the same upload flow. Prevents accidental base64 data URI embedding.

### Frontend Validation

- File size check before upload (error if >5 MB)
- File type check before upload
- Track image count in editor — disable image button and reject drops/pastes at 5 images

### API Client (`client.ts`)

Add `uploadFile` helper that sends `FormData` instead of JSON, with JWT Bearer token attached.

## Content Rendering & Security

### HTML Sanitization

- **Server-side:** When saving a post, validate that `<img src>` URLs point to the `forum-attachments` container (own domain). Strip images with external URLs to prevent hotlinking abuse and XSS.

### Image Display

- Images render inline in post body at natural size, constrained by `max-width: 100%` via the existing `prose prose-invert` Tailwind typography classes.
- No lightbox or gallery — keep it simple for now.

### Content Security Policy

The `forum-attachments` blob URL origin needs to be in `img-src` if a CSP is configured. Likely already covered since it shares the storage account with item icons.

## Deletion Behavior

When a post is soft-deleted (`IsDeleted = true`), images remain in blob storage. Orphaned blobs are accepted; a cleanup background job can be added later if storage grows.

## Guardrails Summary

| Constraint | Value |
|-----------|-------|
| Max file size | 5 MB |
| Allowed types | JPEG, PNG, GIF, WebP |
| Max images per post | 5 |
| Who can upload | Any authenticated user |
| Orphan cleanup | Deferred (not in scope) |
