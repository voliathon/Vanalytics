# API Key Management Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix stale API key state on the profile page and display key creation timestamp so users know a key exists.

**Architecture:** Add `ApiKeyCreatedAt` field to User model, add `refreshUser` to AuthContext to keep user state current after mutations, and update the ProfilePage to show key status with creation date.

**Tech Stack:** ASP.NET Core, EF Core (SQL Server), React, TypeScript

**Important:** Scott handles all git operations. Do NOT run git add, commit, push, or any write commands. Do NOT run `dotnet ef migrations add` — prompt Scott to run it after code changes are in place. Test commands: `cd C:/Git/soverance/Vanalytics && dotnet test tests/Vanalytics.Api.Tests --filter "KeysControllerTests" -v normal`

---

### Task 1: Add ApiKeyCreatedAt to User Model and Configuration

**Files:**
- Modify: `src/lib/Common/src/Soverance.Auth/Models/User.cs:9` (after ApiKey property)
- Modify: `src/lib/Common/src/Soverance.Data/Configurations/UserConfiguration.cs:22` (after ApiKey config)

- [ ] **Step 1: Add property to User model**

In `src/lib/Common/src/Soverance.Auth/Models/User.cs`, add after line 9 (`public string? ApiKey { get; set; }`):

```csharp
public DateTimeOffset? ApiKeyCreatedAt { get; set; }
```

- [ ] **Step 2: Add column configuration**

In `src/lib/Common/src/Soverance.Data/Configurations/UserConfiguration.cs`, add after line 22 (`builder.Property(u => u.ApiKey).HasMaxLength(128);`):

```csharp
builder.Property(u => u.ApiKeyCreatedAt);
```

- [ ] **Step 3: Prompt Scott to generate migration**

Tell Scott to run:
```bash
cd C:/Git/soverance/Vanalytics && dotnet ef migrations add AddApiKeyCreatedAt --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
```

Wait for confirmation before proceeding.

---

### Task 2: Update DTOs and AuthController

**Files:**
- Modify: `src/lib/Common/src/Soverance.Auth/DTOs/AuthDtos.cs:60` (after HasApiKey)
- Modify: `src/Vanalytics.Api/Controllers/AuthController.cs:167` (in Me() profile mapping)

- [ ] **Step 1: Add ApiKeyCreatedAt to UserProfileResponse**

In `src/lib/Common/src/Soverance.Auth/DTOs/AuthDtos.cs`, add after line 60 (`public bool HasApiKey { get; set; }`):

```csharp
public DateTimeOffset? ApiKeyCreatedAt { get; set; }
```

- [ ] **Step 2: Map ApiKeyCreatedAt in AuthController.Me()**

In `src/Vanalytics.Api/Controllers/AuthController.cs`, in the `Me()` method, add after line 167 (`HasApiKey = user.ApiKey is not null,`):

```csharp
ApiKeyCreatedAt = user.ApiKeyCreatedAt,
```

---

### Task 3: Update KeysController to Set/Null ApiKeyCreatedAt

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/KeysController.cs:33-34` (Generate method)
- Modify: `src/Vanalytics.Api/Controllers/KeysController.cs:37-41` (Generate response)
- Modify: `src/Vanalytics.Api/Controllers/KeysController.cs:51` (Revoke method)

- [ ] **Step 1: Set ApiKeyCreatedAt on generate**

In `src/Vanalytics.Api/Controllers/KeysController.cs`, in the `Generate` method, replace:

```csharp
        user.ApiKey = PasswordHasher.HashPassword(rawKey);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiKeyResponse
        {
            ApiKey = rawKey,
            GeneratedAt = user.UpdatedAt
        });
```

With:

```csharp
        user.ApiKey = PasswordHasher.HashPassword(rawKey);
        user.ApiKeyCreatedAt = DateTimeOffset.UtcNow;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiKeyResponse
        {
            ApiKey = rawKey,
            GeneratedAt = user.ApiKeyCreatedAt.Value
        });
```

- [ ] **Step 2: Null ApiKeyCreatedAt on revoke**

In the `Revoke` method, replace:

```csharp
        user.ApiKey = null;
        user.UpdatedAt = DateTimeOffset.UtcNow;
```

With:

```csharp
        user.ApiKey = null;
        user.ApiKeyCreatedAt = null;
        user.UpdatedAt = DateTimeOffset.UtcNow;
```

---

### Task 4: Update Tests for ApiKeyCreatedAt

**Files:**
- Modify: `tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs`

- [ ] **Step 1: Add ApiKeyCreatedAt assertion to Generate test**

In the `Generate_WithAuth_ReturnsApiKey` test, add after line 89 (`Assert.NotEmpty(keyResponse.ApiKey);`):

```csharp
Assert.True(keyResponse.GeneratedAt > DateTimeOffset.UtcNow.AddSeconds(-5));
Assert.True(keyResponse.GeneratedAt <= DateTimeOffset.UtcNow);

// Verify profile reflects ApiKeyCreatedAt
var profileResponse = await _client.SendAsync(AuthedRequest(HttpMethod.Get, "/api/auth/me", token));
var profile = await profileResponse.Content.ReadFromJsonAsync<UserProfileResponse>();
Assert.NotNull(profile!.ApiKeyCreatedAt);
Assert.True(profile.ApiKeyCreatedAt > DateTimeOffset.UtcNow.AddSeconds(-5));
```

- [ ] **Step 2: Add ApiKeyCreatedAt null assertion to Revoke test**

In the `Revoke_WithAuth_RemovesApiKey` test, add after line 119 (`Assert.False(profile!.HasApiKey);`):

```csharp
Assert.Null(profile.ApiKeyCreatedAt);
```

- [ ] **Step 3: Add regenerate timestamp test**

Add a new test after the existing `Generate_Twice_InvalidatesOldKey` test:

```csharp
[Fact]
public async Task Generate_Twice_UpdatesTimestamp()
{
    var token = await RegisterAndGetTokenAsync("keygen3@example.com", "keygen3");

    var response1 = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
    var key1 = (await response1.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

    // Small delay to ensure timestamps differ
    await Task.Delay(100);

    var response2 = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
    var key2 = (await response2.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

    Assert.True(key2.GeneratedAt > key1.GeneratedAt);
}
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Git/soverance/Vanalytics && dotnet test tests/Vanalytics.Api.Tests --filter "KeysControllerTests" -v normal`
Expected: All tests pass.

---

### Task 5: Add refreshUser to AuthContext

**Files:**
- Modify: `src/Vanalytics.Web/src/context/AuthContext.tsx:5-6` (interface)
- Modify: `src/Vanalytics.Web/src/context/AuthContext.tsx:72-76` (before logout, add method)
- Modify: `src/Vanalytics.Web/src/context/AuthContext.tsx:79` (provider value)

- [ ] **Step 1: Add refreshUser to AuthState interface**

In `src/Vanalytics.Web/src/context/AuthContext.tsx`, replace:

```typescript
interface AuthState {
  user: UserProfile | null
  loading: boolean
  login: (req: LoginRequest) => Promise<void>
  register: (req: RegisterRequest) => Promise<void>
  oauthLogin: (provider: string, code: string, redirectUri: string) => Promise<void>
  samlExchange: (code: string) => Promise<void>
  logout: () => void
}
```

With:

```typescript
interface AuthState {
  user: UserProfile | null
  loading: boolean
  login: (req: LoginRequest) => Promise<void>
  register: (req: RegisterRequest) => Promise<void>
  oauthLogin: (provider: string, code: string, redirectUri: string) => Promise<void>
  samlExchange: (code: string) => Promise<void>
  refreshUser: () => Promise<void>
  logout: () => void
}
```

- [ ] **Step 2: Add refreshUser method**

Add after the `samlExchange` method (after line 71) and before `logout`:

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

- [ ] **Step 3: Add refreshUser to provider value**

Replace:

```typescript
    <AuthContext.Provider value={{ user, loading, login, register, oauthLogin, samlExchange, logout }}>
```

With:

```typescript
    <AuthContext.Provider value={{ user, loading, login, register, oauthLogin, samlExchange, refreshUser, logout }}>
```

---

### Task 6: Add apiKeyCreatedAt to Frontend Types

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts:25` (after hasApiKey in UserProfile)

- [ ] **Step 1: Add apiKeyCreatedAt to UserProfile interface**

In `src/Vanalytics.Web/src/types/api.ts`, replace:

```typescript
export interface UserProfile {
  id: string
  email: string
  username: string
  hasApiKey: boolean
  role: UserRole
  oAuthProvider: string | null
  createdAt: string
}
```

With:

```typescript
export interface UserProfile {
  id: string
  email: string
  username: string
  hasApiKey: boolean
  apiKeyCreatedAt: string | null
  role: UserRole
  oAuthProvider: string | null
  createdAt: string
}
```

---

### Task 7: Update ProfilePage API Keys Tab

> **Note:** Steps 1-4 must all be applied before running a typecheck, as intermediate states will have dangling references to the removed `hasKey` state variable.

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Update useAuth destructuring and remove hasKey state**

Replace:

```typescript
  const { user, logout } = useAuth()
```

With:

```typescript
  const { user, logout, refreshUser } = useAuth()
```

Then remove line 40:

```typescript
  const [hasKey, setHasKey] = useState(user?.hasApiKey ?? false)
```

- [ ] **Step 2: Update handleGenerateKey to call refreshUser**

Replace the entire `handleGenerateKey`:

```typescript
  const handleGenerateKey = async () => {
    setKeyError('')
    setKeyLoading(true)
    try {
      const res = await api<ApiKeyResponse>('/api/keys/generate', { method: 'POST' })
      setApiKey(res.apiKey)
      setHasKey(true)
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }
```

With:

```typescript
  const handleGenerateKey = async () => {
    setKeyError('')
    setKeyLoading(true)
    try {
      const res = await api<ApiKeyResponse>('/api/keys/generate', { method: 'POST' })
      setApiKey(res.apiKey)
      refreshUser().catch(() => {})
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }
```

- [ ] **Step 3: Update handleRevokeKey to call refreshUser**

Replace the entire `handleRevokeKey`:

```typescript
  const handleRevokeKey = async () => {
    if (!confirm('Revoke your API key? The Windower addon will stop syncing.')) return
    setKeyError('')
    setKeyLoading(true)
    try {
      await api('/api/keys', { method: 'DELETE' })
      setApiKey(null)
      setHasKey(false)
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }
```

With:

```typescript
  const handleRevokeKey = async () => {
    if (!confirm('Revoke your API key? The Windower addon will stop syncing.')) return
    setKeyError('')
    setKeyLoading(true)
    try {
      await api('/api/keys', { method: 'DELETE' })
      setApiKey(null)
      refreshUser().catch(() => {})
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }
```

- [ ] **Step 4: Update the API Keys tab template**

Replace the entire API Keys tab section:

```typescript
      {/* API Keys tab */}
      {activeTab === 'apikeys' && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 max-w-lg">
          <h2 className="text-lg font-semibold mb-4">Windower API Key</h2>
          <p className="text-sm text-gray-400 mb-4">
            Your API key is used by the Windower addon to sync character data.
            Generating a new key invalidates the previous one.
          </p>

          {keyError && (
            <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
              {keyError}
            </div>
          )}

          {apiKey && (
            <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3">
              <p className="text-xs text-gray-500 mb-1">
                Copy this key now — it won't be shown again.
              </p>
              <code className="text-sm text-green-400 break-all select-all">{apiKey}</code>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleGenerateKey}
              disabled={keyLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {hasKey ? 'Regenerate Key' : 'Generate Key'}
            </button>

            {hasKey && (
              <button
                onClick={handleRevokeKey}
                disabled={keyLoading}
                className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                Revoke Key
              </button>
            )}
          </div>
        </section>
      )}
```

With:

```typescript
      {/* API Keys tab */}
      {activeTab === 'apikeys' && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 max-w-lg">
          <h2 className="text-lg font-semibold mb-4">Windower API Key</h2>
          <p className="text-sm text-gray-400 mb-4">
            Your API key is used by the Windower addon to sync character data.
            Generating a new key invalidates the previous one.
          </p>

          {keyError && (
            <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
              {keyError}
            </div>
          )}

          {apiKey && (
            <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3">
              <p className="text-xs text-gray-500 mb-1">
                Copy this key now — it won't be shown again.
              </p>
              <code className="text-sm text-green-400 break-all select-all">{apiKey}</code>
            </div>
          )}

          {!apiKey && user.hasApiKey && (
            <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-300">
                Active — created on{' '}
                {user.apiKeyCreatedAt
                  ? new Date(user.apiKeyCreatedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'unknown date'}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleGenerateKey}
              disabled={keyLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {apiKey || user.hasApiKey ? 'Regenerate Key' : 'Generate Key'}
            </button>

            {(apiKey || user.hasApiKey) && (
              <button
                onClick={handleRevokeKey}
                disabled={keyLoading}
                className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                Revoke Key
              </button>
            )}
          </div>
        </section>
      )}
```

- [ ] **Step 5: Verify build**

Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`
Expected: No type errors.

---

### Task 8: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd C:/Git/soverance/Vanalytics && dotnet test tests/Vanalytics.Api.Tests --filter "KeysControllerTests" -v normal`
Expected: All tests pass including the new timestamp assertions.

- [ ] **Step 2: Run full test suite**

Run: `cd C:/Git/soverance/Vanalytics && dotnet test -v minimal`
Expected: All tests pass, no regressions.

- [ ] **Step 3: Prompt Scott to commit**

Tell Scott the changes are ready to commit. Files changed:
- `src/lib/Common/src/Soverance.Auth/Models/User.cs`
- `src/lib/Common/src/Soverance.Auth/DTOs/AuthDtos.cs`
- `src/lib/Common/src/Soverance.Data/Configurations/UserConfiguration.cs`
- `src/Vanalytics.Api/Controllers/AuthController.cs`
- `src/Vanalytics.Api/Controllers/KeysController.cs`
- `src/Vanalytics.Core/DTOs/Keys/ApiKeyResponse.cs` (no change needed — already has GeneratedAt)
- `tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs`
- `src/Vanalytics.Web/src/context/AuthContext.tsx`
- `src/Vanalytics.Web/src/types/api.ts`
- `src/Vanalytics.Web/src/pages/ProfilePage.tsx`
- Plus the generated EF Core migration files
