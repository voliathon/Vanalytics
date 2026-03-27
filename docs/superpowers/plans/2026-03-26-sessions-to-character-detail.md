# Move Sessions to Character Detail Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move session browsing and detail views from standalone pages into the character detail page as a "Sessions" tab with a full-screen detail modal.

**Architecture:** Extract session table into `SessionsTab` component, convert session detail page into `SessionDetailModal`, add both to character detail page's `GEAR_TABS`, remove old routes and sidebar section.

**Tech Stack:** React, TypeScript, Tailwind CSS. No new dependencies.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/session/SessionsTab.tsx` | Create | Paginated session table for a single character |
| `src/components/session/SessionDetailModal.tsx` | Create | Full-screen overlay with session detail (4 inner tabs) |
| `src/pages/CharacterDetailPage.tsx` | Modify | Add "Sessions" to GEAR_TABS, wire up components |
| `src/App.tsx` | Modify | Remove session routes and imports |
| `src/components/Layout.tsx` | Modify | Remove Performance sidebar section |
| `src/pages/SessionsPage.tsx` | Delete | Replaced by SessionsTab |
| `src/pages/SessionDetailPage.tsx` | Delete | Replaced by SessionDetailModal |

All paths relative to `src/Vanalytics.Web/`.

---

### Task 1: Create SessionsTab component

**Files:**
- Create: `src/Vanalytics.Web/src/components/session/SessionsTab.tsx`

- [ ] **Step 1: Create the component**

Extract the session table from `SessionsPage.tsx` into a standalone component. Remove the character dropdown (character is implicit). Remove `useNavigate` — clicking a row calls `onSelectSession` instead. Remove the "Character" column from the table.

```tsx
import { useState, useEffect } from 'react'
import type { SessionSummary, SessionListResponse } from '../../types/api'
import { api } from '../../api/client'

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'Active'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

interface SessionsTabProps {
  characterId: string
  onSelectSession: (sessionId: string) => void
}

export default function SessionsTab({ characterId, onSelectSession }: SessionsTabProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    setLoading(true)
    api<SessionListResponse>(`/api/sessions?characterId=${characterId}&page=${page}&pageSize=${pageSize}`)
      .then((data) => {
        setSessions(data.sessions)
        setTotalCount(data.totalCount)
      })
      .catch(() => {
        setSessions([])
        setTotalCount(0)
      })
      .finally(() => setLoading(false))
  }, [characterId, page])

  if (loading) return <p className="text-gray-400">Loading...</p>

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400 mb-2">No sessions yet.</p>
        <p className="text-sm text-gray-500">
          Start tracking with <code className="bg-gray-800 px-1 rounded text-gray-300">//va session start</code> in-game.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3 text-right">Total Damage</th>
              <th className="px-4 py-3 text-right">Gil Earned</th>
              <th className="px-4 py-3 text-right">Drops</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sessions.map((s) => (
              <tr
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className="bg-gray-900 hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {new Date(s.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{s.zone}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.endedAt === null ? (
                    <span className="text-green-400">Active</span>
                  ) : (
                    formatDuration(s.startedAt, s.endedAt)
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.totalDamage.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.gilEarned.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {s.itemsDropped}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
        >
          Previous
        </button>
        <span className="text-sm text-gray-400">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
        >
          Next
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `SessionsTab.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/session/SessionsTab.tsx
git commit -m "feat: create SessionsTab component for character detail page"
```

---

### Task 2: Create SessionDetailModal component

**Files:**
- Create: `src/Vanalytics.Web/src/components/session/SessionDetailModal.tsx`

- [ ] **Step 1: Create the modal component**

Convert `SessionDetailPage.tsx` into a modal. Changes from the original:
- Accept `sessionId` and `onClose` props instead of using `useParams`/`useNavigate`
- Wrap in a full-screen overlay with backdrop, close button, and escape key
- Lock body scroll while open
- Delete navigates back to session list (calls `onClose`) instead of `/sessions`
- Remove the "Back to Sessions" link (replaced by close button)

```tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../../api/client'
import type { SessionDetail, SessionEvent, SessionEventsResponse, SessionTimelineEntry } from '../../types/api'

const TABS = ['Timeline', 'Combat', 'Loot', 'Raw Events'] as const
type Tab = typeof TABS[number]

const EVENT_TYPES = [
  'MeleeDamage', 'RangedDamage', 'MagicDamage', 'AbilityDamage',
  'WeaponSkillDamage', 'Healing', 'ItemDrop', 'GilGain', 'GilLoss',
  'MobKill', 'ExpGain', 'Unknown',
] as const

function fmt(n: number): string {
  return n.toLocaleString()
}

function fmt1(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalSec = Math.floor((end - start) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}h ${m}m ${s}s`
}

function relativeTime(sessionStart: string, timestamp: string): string {
  const diff = Math.floor((new Date(timestamp).getTime() - new Date(sessionStart).getTime()) / 1000)
  const m = Math.floor(diff / 60)
  const s = diff % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface SessionDetailModalProps {
  sessionId: string
  onClose: () => void
  /** Called after a session is deleted so the parent can refresh its list */
  onDeleted?: () => void
}

export default function SessionDetailModal({ sessionId, onClose, onDeleted }: SessionDetailModalProps) {
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Timeline')

  const [timeline, setTimeline] = useState<SessionTimelineEntry[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  const [allEvents, setAllEvents] = useState<SessionEvent[]>([])
  const [allEventsLoading, setAllEventsLoading] = useState(false)

  const [rawEvents, setRawEvents] = useState<SessionEvent[]>([])
  const [rawTotal, setRawTotal] = useState(0)
  const [rawPage, setRawPage] = useState(1)
  const [rawLoading, setRawLoading] = useState(false)
  const [rawTypeFilters, setRawTypeFilters] = useState<Set<string>>(new Set(EVENT_TYPES))

  // Escape key closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Fetch session detail
  useEffect(() => {
    setLoading(true)
    api<SessionDetail>(`/api/sessions/${sessionId}`)
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [sessionId])

  // Fetch timeline
  useEffect(() => {
    setTimelineLoading(true)
    api<SessionTimelineEntry[]>(`/api/sessions/${sessionId}/timeline`)
      .then(setTimeline)
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false))
  }, [sessionId])

  // Fetch all events (for Combat + Loot)
  useEffect(() => {
    setAllEventsLoading(true)
    api<SessionEventsResponse>(`/api/sessions/${sessionId}/events?page=1&pageSize=10000`)
      .then(r => setAllEvents(r.events))
      .catch(() => setAllEvents([]))
      .finally(() => setAllEventsLoading(false))
  }, [sessionId])

  // Fetch raw events (paginated, with type filter)
  useEffect(() => {
    setRawLoading(true)
    const typeParam = rawTypeFilters.size < EVENT_TYPES.length && rawTypeFilters.size > 0
      ? `&eventType=${Array.from(rawTypeFilters).join(',')}`
      : ''
    api<SessionEventsResponse>(`/api/sessions/${sessionId}/events?page=${rawPage}&pageSize=100${typeParam}`)
      .then(r => { setRawEvents(r.events); setRawTotal(r.totalCount) })
      .catch(() => { setRawEvents([]); setRawTotal(0) })
      .finally(() => setRawLoading(false))
  }, [sessionId, rawPage, rawTypeFilters])

  const damageTypes = useMemo(() => new Set(['MeleeDamage', 'RangedDamage', 'MagicDamage', 'AbilityDamage', 'WeaponSkillDamage']), [])

  const combatSummary = useMemo(() => {
    const damageByAbility = new Map<string, { total: number; count: number }>()
    const healingByAbility = new Map<string, { total: number; count: number }>()

    for (const ev of allEvents) {
      if (damageTypes.has(ev.eventType)) {
        const key = ev.ability || ev.eventType
        const entry = damageByAbility.get(key) || { total: 0, count: 0 }
        entry.total += ev.value
        entry.count += 1
        damageByAbility.set(key, entry)
      } else if (ev.eventType === 'Healing') {
        const key = ev.ability || 'Healing'
        const entry = healingByAbility.get(key) || { total: 0, count: 0 }
        entry.total += ev.value
        entry.count += 1
        healingByAbility.set(key, entry)
      }
    }

    const damageRows = Array.from(damageByAbility.entries())
      .map(([ability, d]) => ({ ability, total: d.total, count: d.count, avg: d.total / d.count }))
      .sort((a, b) => b.total - a.total)

    const healingRows = Array.from(healingByAbility.entries())
      .map(([ability, d]) => ({ ability, total: d.total, count: d.count, avg: d.total / d.count }))
      .sort((a, b) => b.total - a.total)

    return { damageRows, healingRows }
  }, [allEvents, damageTypes])

  const lootData = useMemo(() => {
    const items = allEvents.filter(e => e.eventType === 'ItemDrop')
    const gilGains = allEvents.filter(e => e.eventType === 'GilGain')
    const gilLosses = allEvents.filter(e => e.eventType === 'GilLoss')
    const netGil = gilGains.reduce((s, e) => s + e.value, 0) - gilLosses.reduce((s, e) => s + e.value, 0)
    return { items, gilGains, gilLosses, netGil }
  }, [allEvents])

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this session? This cannot be undone.')) return
    try {
      await api(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      onDeleted?.()
      onClose()
    } catch {
      alert('Failed to delete session.')
    }
  }, [sessionId, onClose, onDeleted])

  const toggleRawType = (type: string) => {
    setRawTypeFilters(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
    setRawPage(1)
  }

  const rawTotalPages = Math.ceil(rawTotal / 100)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal content */}
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl mt-[5vh] mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-xl z-10"
          aria-label="Close"
        >
          &times;
        </button>

        <div className="p-6">
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : !session ? (
            <p className="text-red-400">Session not found.</p>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-6 pr-8">
                <div>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-2xl font-bold">{session.characterName}</h2>
                    <span className="text-gray-400 text-sm">{session.server}</span>
                    {session.zone && <span className="text-gray-400 text-sm">{session.zone}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 mt-1">
                    <span>Start: {new Date(session.startedAt).toLocaleString()}</span>
                    <span>End: {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'Active'}</span>
                    <span>Duration: {formatDuration(session.startedAt, session.endedAt)}</span>
                    <span className={`font-medium ${session.status === 'Active' ? 'text-green-400' : session.status === 'Abandoned' ? 'text-yellow-400' : 'text-gray-300'}`}>
                      {session.status}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  Delete
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
                {[
                  { label: 'Total Damage', value: fmt(session.totalDamage) },
                  { label: 'DPS Average', value: fmt1(session.dpsAverage) },
                  { label: 'Gil Earned', value: fmt(session.gilEarned) },
                  { label: 'Gil/Hour', value: fmt1(session.gilPerHour) },
                  { label: 'Items Dropped', value: fmt(session.itemsDropped) },
                  { label: 'Mobs Killed', value: fmt(session.mobsKilled) },
                  { label: 'XP Gained', value: fmt(session.expGained) },
                  { label: 'Healing Done', value: fmt(session.healingDone) },
                ].map(card => (
                  <div key={card.label} className="bg-gray-800 rounded-lg p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">{card.label}</div>
                    <div className="text-lg font-semibold text-gray-100">{card.value}</div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-700 mb-4">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div>
                {activeTab === 'Timeline' && (
                  <div>
                    {timelineLoading ? (
                      <p className="text-gray-400">Loading timeline...</p>
                    ) : timeline.length === 0 ? (
                      <p className="text-gray-500">No timeline data.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700 text-gray-400 text-left">
                              <th className="py-2 px-3">Time</th>
                              <th className="py-2 px-3 text-right">Damage</th>
                              <th className="py-2 px-3 text-right">Healing</th>
                              <th className="py-2 px-3 text-right">Gil</th>
                              <th className="py-2 px-3 text-right">Kills</th>
                            </tr>
                          </thead>
                          <tbody>
                            {timeline.map((entry, i) => (
                              <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                                <td className="py-1.5 px-3 text-gray-300">{relativeTime(session.startedAt, entry.timestamp)}</td>
                                <td className="py-1.5 px-3 text-right text-red-400">{entry.damage > 0 ? fmt(entry.damage) : '-'}</td>
                                <td className="py-1.5 px-3 text-right text-green-400">{entry.healing > 0 ? fmt(entry.healing) : '-'}</td>
                                <td className="py-1.5 px-3 text-right text-yellow-400">{entry.gil !== 0 ? fmt(entry.gil) : '-'}</td>
                                <td className="py-1.5 px-3 text-right text-gray-300">{entry.kills > 0 ? entry.kills : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'Combat' && (
                  <div>
                    {allEventsLoading ? (
                      <p className="text-gray-400">Loading combat data...</p>
                    ) : (
                      <>
                        <h3 className="text-md font-semibold text-gray-200 mb-2">Damage by Ability</h3>
                        {combatSummary.damageRows.length === 0 ? (
                          <p className="text-gray-500 mb-6">No damage events recorded.</p>
                        ) : (
                          <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-700 text-gray-400 text-left">
                                  <th className="py-2 px-3">Ability</th>
                                  <th className="py-2 px-3 text-right">Total Damage</th>
                                  <th className="py-2 px-3 text-right">Times Used</th>
                                  <th className="py-2 px-3 text-right">Avg Damage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {combatSummary.damageRows.map(row => (
                                  <tr key={row.ability} className="border-b border-gray-800 hover:bg-gray-800/50">
                                    <td className="py-1.5 px-3 text-gray-200">{row.ability}</td>
                                    <td className="py-1.5 px-3 text-right text-red-400">{fmt(row.total)}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-300">{fmt(row.count)}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-300">{fmt1(row.avg)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h3 className="text-md font-semibold text-gray-200 mb-2">Healing by Ability</h3>
                        {combatSummary.healingRows.length === 0 ? (
                          <p className="text-gray-500">No healing events recorded.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-700 text-gray-400 text-left">
                                  <th className="py-2 px-3">Ability</th>
                                  <th className="py-2 px-3 text-right">Total Healing</th>
                                  <th className="py-2 px-3 text-right">Times Used</th>
                                  <th className="py-2 px-3 text-right">Avg Healing</th>
                                </tr>
                              </thead>
                              <tbody>
                                {combatSummary.healingRows.map(row => (
                                  <tr key={row.ability} className="border-b border-gray-800 hover:bg-gray-800/50">
                                    <td className="py-1.5 px-3 text-gray-200">{row.ability}</td>
                                    <td className="py-1.5 px-3 text-right text-green-400">{fmt(row.total)}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-300">{fmt(row.count)}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-300">{fmt1(row.avg)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'Loot' && (
                  <div>
                    {allEventsLoading ? (
                      <p className="text-gray-400">Loading loot data...</p>
                    ) : (
                      <>
                        <h3 className="text-md font-semibold text-gray-200 mb-2">Items</h3>
                        {lootData.items.length === 0 ? (
                          <p className="text-gray-500 mb-6">No item drops recorded.</p>
                        ) : (
                          <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-700 text-gray-400 text-left">
                                  <th className="py-2 px-3">Item</th>
                                  <th className="py-2 px-3 text-right">Qty</th>
                                  <th className="py-2 px-3">Time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lootData.items.map(ev => (
                                  <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                    <td className="py-1.5 px-3 text-gray-200">{ev.target}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-300">{ev.value}</td>
                                    <td className="py-1.5 px-3 text-gray-400">{relativeTime(session.startedAt, ev.timestamp)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h3 className="text-md font-semibold text-gray-200 mb-2">Gil</h3>
                        {lootData.gilGains.length === 0 && lootData.gilLosses.length === 0 ? (
                          <p className="text-gray-500">No gil transactions recorded.</p>
                        ) : (
                          <>
                            <div className="overflow-x-auto mb-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                                    <th className="py-2 px-3">Type</th>
                                    <th className="py-2 px-3 text-right">Amount</th>
                                    <th className="py-2 px-3">Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...lootData.gilGains.map(e => ({ ...e, _type: 'Gain' as const })),
                                    ...lootData.gilLosses.map(e => ({ ...e, _type: 'Loss' as const }))]
                                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                    .map(ev => (
                                      <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className={`py-1.5 px-3 ${ev._type === 'Gain' ? 'text-green-400' : 'text-red-400'}`}>
                                          {ev._type}
                                        </td>
                                        <td className={`py-1.5 px-3 text-right ${ev._type === 'Gain' ? 'text-green-400' : 'text-red-400'}`}>
                                          {ev._type === 'Loss' ? '-' : ''}{fmt(ev.value)}
                                        </td>
                                        <td className="py-1.5 px-3 text-gray-400">{relativeTime(session.startedAt, ev.timestamp)}</td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="text-sm text-gray-300">
                              Net Gil: <span className={lootData.netGil >= 0 ? 'text-green-400' : 'text-red-400'}>{lootData.netGil >= 0 ? '+' : ''}{fmt(lootData.netGil)}</span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'Raw Events' && (
                  <div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {EVENT_TYPES.map(type => (
                        <label key={type} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rawTypeFilters.has(type)}
                            onChange={() => toggleRawType(type)}
                            className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          {type}
                        </label>
                      ))}
                    </div>

                    {rawLoading ? (
                      <p className="text-gray-400">Loading events...</p>
                    ) : rawEvents.length === 0 ? (
                      <p className="text-gray-500">No events found.</p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-700 text-gray-400 text-left">
                                <th className="py-2 px-3">Time</th>
                                <th className="py-2 px-3">Type</th>
                                <th className="py-2 px-3">Source</th>
                                <th className="py-2 px-3">Target</th>
                                <th className="py-2 px-3 text-right">Value</th>
                                <th className="py-2 px-3">Ability</th>
                                <th className="py-2 px-3">Zone</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rawEvents.map(ev => (
                                <tr key={ev.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                  <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">{relativeTime(session.startedAt, ev.timestamp)}</td>
                                  <td className="py-1.5 px-3 text-gray-300">{ev.eventType}</td>
                                  <td className="py-1.5 px-3 text-gray-200">{ev.source}</td>
                                  <td className="py-1.5 px-3 text-gray-200">{ev.target}</td>
                                  <td className="py-1.5 px-3 text-right text-gray-300">{fmt(ev.value)}</td>
                                  <td className="py-1.5 px-3 text-gray-400">{ev.ability ?? '-'}</td>
                                  <td className="py-1.5 px-3 text-gray-400">{ev.zone}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                          <span>{fmt(rawTotal)} total events</span>
                          <div className="flex gap-2">
                            <button
                              disabled={rawPage <= 1}
                              onClick={() => setRawPage(p => p - 1)}
                              className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Prev
                            </button>
                            <span className="px-3 py-1">Page {rawPage} of {rawTotalPages}</span>
                            <button
                              disabled={rawPage >= rawTotalPages}
                              onClick={() => setRawPage(p => p + 1)}
                              className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `SessionDetailModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/session/SessionDetailModal.tsx
git commit -m "feat: create SessionDetailModal full-screen overlay component"
```

---

### Task 3: Wire Sessions tab into CharacterDetailPage

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

- [ ] **Step 1: Add imports at the top of the file**

Add after the existing component imports:

```tsx
import SessionsTab from '../components/session/SessionsTab'
import SessionDetailModal from '../components/session/SessionDetailModal'
```

- [ ] **Step 2: Update GEAR_TABS to include Sessions**

Change line 24 from:

```tsx
const GEAR_TABS = ['Equipment', 'Inventory', 'Macros'] as const
```

to:

```tsx
const GEAR_TABS = ['Equipment', 'Inventory', 'Macros', 'Sessions'] as const
```

- [ ] **Step 3: Add session modal state**

Inside the component function, after the existing macro state declarations (around line 42), add:

```tsx
  // Session state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0)
```

- [ ] **Step 4: Add Sessions tab content**

After the Macros tab content block (the `{gearTab === 'Macros' && (...)}` section, around line 347), add:

```tsx
        {gearTab === 'Sessions' && (
          <SessionsTab
            key={sessionsRefreshKey}
            characterId={character.id}
            onSelectSession={setSelectedSessionId}
          />
        )}
```

- [ ] **Step 5: Add the session detail modal**

At the end of the return JSX, just before the closing `</>` of the component, add:

```tsx
      {selectedSessionId && (
        <SessionDetailModal
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
          onDeleted={() => setSessionsRefreshKey(k => k + 1)}
        />
      )}
```

- [ ] **Step 6: Verify it compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx
git commit -m "feat: add Sessions tab to character detail page"
```

---

### Task 4: Remove old session routes and sidebar section

**Files:**
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`
- Delete: `src/Vanalytics.Web/src/pages/SessionsPage.tsx`
- Delete: `src/Vanalytics.Web/src/pages/SessionDetailPage.tsx`

- [ ] **Step 1: Remove session imports and routes from App.tsx**

In `App.tsx`, remove these two import lines (around lines 30-31):

```tsx
import SessionsPage from './pages/SessionsPage'
import SessionDetailPage from './pages/SessionDetailPage'
```

And remove these two route lines (around lines 117-118):

```tsx
            <Route path="/sessions" element={<ProtectedRoute><SessionsPage /></ProtectedRoute>} />
            <Route path="/sessions/:id" element={<ProtectedRoute><SessionDetailPage /></ProtectedRoute>} />
```

- [ ] **Step 2: Remove Performance sidebar section from Layout.tsx**

In `Layout.tsx`, remove the `'performance'` entry from the `SectionName` type (line 14). Change from:

```tsx
type SectionName = 'database' | 'economy' | 'performance' | 'server' | 'admin'
```

to:

```tsx
type SectionName = 'database' | 'economy' | 'server' | 'admin'
```

Remove the sessions path check from `getSection()` (line 19):

```tsx
  if (pathname.startsWith('/sessions')) return 'performance'
```

Remove the Performance `SidebarSection` block (lines 163-165):

```tsx
          <SidebarSection label="Performance" icon={<Swords className="h-4 w-4 shrink-0" />} isOpen={openSection === 'performance'} onToggle={() => toggleSection('performance')}>
            <SidebarLink to="/sessions" label="Sessions" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>
```

If `Swords` is no longer used anywhere else in Layout.tsx after this removal, also remove it from the lucide-react import (line 7).

- [ ] **Step 3: Delete the old page files**

```bash
rm src/Vanalytics.Web/src/pages/SessionsPage.tsx
rm src/Vanalytics.Web/src/pages/SessionDetailPage.tsx
```

- [ ] **Step 4: Verify everything compiles**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors. If there are unused import warnings for `Swords`, remove it from Layout.tsx imports.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove standalone session pages and Performance sidebar section"
```
