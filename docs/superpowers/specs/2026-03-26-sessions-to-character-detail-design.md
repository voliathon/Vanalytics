# Move Sessions to Character Detail Page

## Overview

Relocate the session browsing and detail views from standalone pages (`/sessions`, `/sessions/:id`) into the character detail page as a new "Sessions" tab. Session detail becomes a full-screen overlay modal instead of a separate route. The "Performance" sidebar section is removed entirely.

## Current State

- `SessionsPage.tsx` (169 lines) — paginated session table with character dropdown filter, lives at `/sessions`
- `SessionDetailPage.tsx` (493 lines) — 4-tab detail view (Timeline, Combat, Loot, Raw Events) with 8 summary cards, lives at `/sessions/:id`
- `CharacterDetailPage.tsx` (375 lines) — has `GEAR_TABS = ['Equipment', 'Inventory', 'Macros']`
- Sidebar has "Performance" section with "Sessions" link

## Changes

### New: `SessionsTab` component

Extracted from `SessionsPage.tsx` table/pagination logic. Simplified:

- Receives `characterId: string` prop
- Fetches `GET /api/sessions?characterId={characterId}&page=X&pageSize=20`
- Renders paginated session table (same columns: Date, Zone, Duration, Total Damage, Gil Earned, Drops)
- No character dropdown (character is implicit from the detail page context)
- Clicking a row calls `onSelectSession(sessionId)` callback instead of navigating
- "Character" column removed from table since all sessions belong to the same character

### New: `SessionDetailModal` component

Extracted from `SessionDetailPage.tsx`, wrapped in a full-screen overlay:

- Receives `sessionId: string` and `onClose: () => void` props
- Full-screen overlay with dark backdrop, close button, escape key dismissal
- Same content as current page: session header, 8 summary cards, 4 inner tabs (Timeline, Combat, Loot, Raw Events)
- Same data fetching: session detail, timeline, events endpoints
- Same memoized combat/loot aggregations
- Delete button triggers `onClose` after successful deletion

### Modified: `CharacterDetailPage.tsx`

- Add "Sessions" to `GEAR_TABS`: `['Equipment', 'Inventory', 'Macros', 'Sessions']`
- When Sessions tab active, render `<SessionsTab characterId={id} onSelectSession={setSelectedSessionId} />`
- State: `selectedSessionId: string | null` controls modal visibility
- Render: `{selectedSessionId && <SessionDetailModal sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />}`

### Modified: `App.tsx`

- Remove `/sessions` route
- Remove `/sessions/:id` route
- Remove imports for `SessionsPage` and `SessionDetailPage`

### Modified: `Layout.tsx` (sidebar)

- Remove "Performance" section and its "Sessions" link entirely

### Deleted

- `src/pages/SessionsPage.tsx`
- `src/pages/SessionDetailPage.tsx`

## API

No backend changes. Existing endpoints used:

- `GET /api/sessions?characterId={id}&page=X&pageSize=20` — session list
- `GET /api/sessions/{id}` — session detail
- `GET /api/sessions/{id}/timeline` — time-bucketed aggregates
- `GET /api/sessions/{id}/events?page=X&pageSize=100` — paginated events
- `DELETE /api/sessions/{id}` — delete session

## Component Hierarchy

```
CharacterDetailPage
  ├── [Equipment tab] → ModelViewer + EquipmentGrid
  ├── [Inventory tab] → InventoryTab
  ├── [Macros tab] → MacroPageReel + MacroEditorPanel
  └── [Sessions tab] → SessionsTab
                          └── SessionDetailModal (full-screen overlay, conditional)
```

## Modal Behavior

- **Open:** Click a session row in the table
- **Close:** Click X button, press Escape, or click backdrop
- **Scroll:** Modal content scrolls independently; page behind does not scroll
- **Delete:** After confirming deletion, modal closes and session list refreshes
