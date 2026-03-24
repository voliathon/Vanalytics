# API Key Management Polish

**Date:** 2026-03-24
**Status:** Draft

## Problem

After generating an API key, the profile page does not reflect the updated state until a manual browser refresh. The `user` object in AuthContext retains stale `hasApiKey: false` because nothing re-fetches the profile after key operations. Additionally, there is no visible indication that a key exists beyond the presence of a "Revoke Key" button — no timestamp or status display.

## Solution

Three changes:

1. **Add `ApiKeyCreatedAt` field** to the User model (nullable `DateTimeOffset`), set on generation, nulled on revocation. New EF Core migration.
2. **Add `refreshUser` to AuthContext** so any component can re-fetch `/api/auth/me` and update the global user state.
3. **Update the ProfilePage API Keys tab** to show key status with creation timestamp, and call `refreshUser()` after key operations.

## Backend Changes

### User Model (`Soverance.Auth/Models/User.cs`)

Add property:

```csharp
public DateTimeOffset? ApiKeyCreatedAt { get; set; }
```

### UserConfiguration (`Soverance.Data/Configurations/UserConfiguration.cs`)

Add explicit column configuration for `ApiKeyCreatedAt` to match the established pattern where every User property is explicitly configured.

### Database Migration

New migration adding `ApiKeyCreatedAt` column (nullable `datetimeoffset`) to the `Users` table. The migration is generated from the Vanalytics project (which owns `VanalyticsDbContext` inheriting from `SoveranceDbContextBase`), following the existing pattern used for prior auth field migrations.

### KeysController (`Vanalytics.Api/Controllers/KeysController.cs`)

**Generate endpoint:**
- Set `user.ApiKeyCreatedAt = DateTimeOffset.UtcNow` when generating a key
- Return `ApiKeyCreatedAt` in the response (already has `GeneratedAt` field — source it from the new dedicated field instead of `UpdatedAt`)

**Revoke endpoint:**
- Set `user.ApiKeyCreatedAt = null` alongside `user.ApiKey = null`

### DTOs

**ApiKeyResponse** (`Vanalytics.Core/DTOs/Keys/ApiKeyResponse.cs`): No structural change — `GeneratedAt` now sources from `ApiKeyCreatedAt`.

**UserProfileResponse** (`Soverance.Auth/DTOs/AuthDtos.cs`): Add `public DateTimeOffset? ApiKeyCreatedAt { get; set; }`.

**AuthController** (`Vanalytics.Api/Controllers/AuthController.cs`): Map `user.ApiKeyCreatedAt` into the profile response.

## Frontend Changes

### AuthContext (`AuthContext.tsx`)

Add `refreshUser` method with error handling consistent with the existing mount-time fetch:

```typescript
const refreshUser = async () => {
  try {
    const profile = await api<UserProfile>('/api/auth/me')
    setUser(profile)
  } catch {
    clearTokens()
    setUser(null)
  }
}
```

Expose `refreshUser` on the context interface and provider value.

### Types (`types/api.ts`)

Add to `UserProfile`:

```typescript
apiKeyCreatedAt: string | null
```

### ProfilePage (`ProfilePage.tsx`)

- Remove local `hasKey` state — derive from `user.hasApiKey` directly for states 1 and 3
- Call `refreshUser()` after successful generate and revoke operations
- Display key status when `user.hasApiKey` is true and no plaintext key is showing

**State derivation:** State 2 is active whenever the local `apiKey` state is non-null (plaintext key in memory), which takes visual precedence over `user.hasApiKey`. This avoids a brief flash between generate completing and `refreshUser` resolving. States 1 and 3 derive from `user.hasApiKey`. The existing `keyLoading` disabled state on buttons prevents race conditions from rapid clicks.

Three visual states for the API Keys tab:
1. **No key** (`!apiKey && !user.hasApiKey`): "Generate Key" button only
2. **Just generated** (`apiKey` is set): Copy-now warning with key display + Regenerate/Revoke buttons
3. **Key exists, revisiting** (`!apiKey && user.hasApiKey`): Status block showing "Active — created on {formatted date}" + Regenerate/Revoke buttons

## Tests

Update `KeysControllerTests`:
- Assert `ApiKeyCreatedAt` is populated (and within a few seconds of now) in the profile response after generation
- Assert `ApiKeyCreatedAt` is null in the profile response after revocation
- Assert that regenerating a key produces a newer `ApiKeyCreatedAt` than the first generation

## Files Modified

| File | Change |
|------|--------|
| `Soverance.Auth/Models/User.cs` | Add `ApiKeyCreatedAt` property |
| `Soverance.Auth/DTOs/AuthDtos.cs` | Add `ApiKeyCreatedAt` to `UserProfileResponse` |
| `Vanalytics.Api/Controllers/KeysController.cs` | Set/null `ApiKeyCreatedAt` on generate/revoke |
| `Vanalytics.Api/Controllers/AuthController.cs` | Map `ApiKeyCreatedAt` to profile response |
| `Vanalytics.Core/DTOs/Keys/ApiKeyResponse.cs` | Source `GeneratedAt` from dedicated field |
| `Soverance.Data/Configurations/UserConfiguration.cs` | Add `ApiKeyCreatedAt` column configuration |
| `Vanalytics.Data/` | New EF Core migration |
| `Vanalytics.Web/src/context/AuthContext.tsx` | Add `refreshUser` method |
| `Vanalytics.Web/src/types/api.ts` | Add `apiKeyCreatedAt` to `UserProfile` |
| `Vanalytics.Web/src/pages/ProfilePage.tsx` | Remove local `hasKey`, add status display, call `refreshUser` |
| `Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs` | Assert `ApiKeyCreatedAt` behavior |
