# Recall·Queue — Project Context

## What this app is for

Recall·Queue is a personal spaced-repetition (SRS) trainer for Google interview
DSA prep. It's a single-page PWA, deployed via GitHub Pages.

- **Live:** https://in0x.github.io/srs-prep/
- **Repo:** https://github.com/in0x/srs-prep
- **Stack:** React 18 (via esm.sh CDN, no build step), plain JS (`React.createElement`,
  not JSX), `localStorage` for persistence, a service worker for offline caching.
- **Files:** `index.html`, `app.js` (single file, ~294KB, all 199 cards embedded
  as a JSON seed array), `sw.js`, `manifest.json`, two icons.

The deck is 199 LeetCode-style problems seeded from the owner's own algorithm
prep spreadsheet (`Algo_Prep.xlsx`). Each card's "front" is the problem name/number
(the recall cue); the "back" is the owner's own written approach + complexity
notes — not the official LeetCode solution. The goal is active recall of *your
own* mental model for solving each problem, not re-reading a canonical answer.

## How it works, conceptually

### Scheduling: SM-2

Standard SM-2 algorithm. Each card has a `sched` record: `{ ease, interval, reps,
due, status, struggleStreak, implAt }`.

- `status` is `"new" | "learning" | "review"`.
- Grading a card (`again` / `hard` / `good` / `easy`) recomputes `ease` and
  `interval` and reschedules `due`.
- `again` always drops the card back into `"learning"` with `interval: 0` (due
  today) — i.e. it doesn't wait for the next SM-2 cycle, it comes back into the
  *current session's* queue immediately (see queue mechanics below).
- Over time, interval growth means daily review load stabilizes rather than
  growing without bound — this is expected SM-2 behavior, not a bug if daily due
  counts plateau after the initial ramp-up.

### Two pools: priority vs. standard categories

New cards aren't drawn from one undifferentiated pool. `settings.priorityCategories`
(default: an "embedded-flavor" preset — Arrays & Hashing, Two Pointers, Sliding
Window, Bit Manipulation, Trees, Graphs, Advanced Graphs, Heap/Priority Queue)
defines which categories count as "priority." Every other category is "standard."

New cards get split into `priorityNewCards` and `standardNewCards`, and each pool
draws from its own daily budget (`settings.priorityPerDay`, default 5;
`settings.standardPerDay`, default 3). This guarantees daily coverage of both the
categories the owner cares most about *and* everything else, rather than one
category type starving another.

If one pool runs dry for the day, the shortfall rolls over and is filled from the
other pool (see `buildQueue`'s rollover logic) so the full daily total still gets
used.

### Risk tiers and the High-decay cap

Every card has a static `risk: "High" | "Med" | "Low"` field — a property baked
into the seed data per-problem (not computed/dynamic; it reflects the owner's own
sense of how prone that problem is to being forgotten / how complex it is).

`RISK_RANK = { High: 0, Med: 1, Low: 2 }` is used to sort new cards: High-risk
cards surface before Med, Med before Low, within each pool.

**Known limitation (currently being addressed):** the secondary sort key, used
to break ties *within* a risk tier, is currently `a.order - b.order` — literal
row position in the original spreadsheet. Since the sheet is grouped by category,
this means within a risk tier the app effectively serves one category's cards
in a contiguous block before moving to the next category, rather than mixing
categories. This is bad for learning: interleaved practice (mixing problem types)
produces better long-term pattern-recognition and discrimination than blocked
practice (one type at a time), and part of the real interview skill is
identifying *which* technique applies *without* being told the category first.
**This is the subject of the round-robin change described in the prompt file.**

On top of risk-tier ordering, `settings.highPerDay` (default 3) is a hard daily
cap on how many High-risk cards can be introduced *in total*, across both pools
combined — implemented via a shared, mutated-in-place counter (`highRemaining`)
passed into `selectFromPool` for each pool in turn. This prevents High-risk cards
from flooding a single day's queue just because they sort first.

### Due-card ordering (reviews, as opposed to new cards)

Cards already in `"learning"`/`"review"` status that are due today (`dueCards`)
are sorted purely by how overdue they are — most-overdue-first — with **no**
reference to category, risk, or sheet order at all:

```
dueCards.sort((a, b) => diffDays(sched[b.id].due, sched[a.id].due) - ...)
```

In practice this gives *incidental* category mixing (not engineered): cards
introduced together on the same day start with similar SM-2 trajectories and
tend to come due together, but individual grading history (ease factor,
struggle streak) causes intervals to diverge over time, which organically
breaks up same-category clusters. This is weaker than the new-card pool split,
and is also part of the round-robin change.

### Queue mechanics

`buildQueue()` runs once per day (or restores a persisted in-progress queue if
one exists for today) and assembles: all due review cards (sorted most-overdue
first) + a fresh selection of new cards (priority pool budget + standard pool
budget, respecting the High-decay cap). The queue is just an ordered list of
card IDs.

Grading behavior: `easy`/`good`/`hard` drop the card from the front of the
queue; `again` sends it to the *back* of the current queue (so it resurfaces
later in the same session, not tomorrow).

"Pull in more new cards" (shown on the empty-state / queue-cleared screen)
recomputes available headroom from the same two pools and the same High-decay
cap, appends more cards to the existing queue without resetting it.

Queue state (the ID list, the date it was built for, and reveal state) persists
across page refreshes via `localStorage`, restored on load if the persisted
`queueDate` matches today.

### The "🔧 Reimplement" badge

A card gets flagged for full reimplementation (not just flashcard recall) under
three independent conditions, computed by `reimplementStatus(sched)`:

- `struggling`: failed recall (`again`/`hard`) twice in a row (`struggleStreak >= 2`).
- `shaky`: chronically low ease factor (`ease <= 1.8`), even with occasional
  good grades.
- `verify`: the SM-2 interval has grown long relative to when the card was last
  actually implemented in code (`interval >= max(7, implAt * 2)`) — a nudge to
  re-validate that written-down approach still holds up against real code, not
  just memory.

`implAt` tracks the interval-at-last-implementation; `markImplemented(id)`
resets `struggleStreak` to 0, bumps `ease` slightly, and records the current
interval into `implAt`.

**Migration guard, important:** `implAt` and `struggleStreak` didn't exist in
early versions of the schema. On load, any persisted card schedule missing
`implAt` gets backfilled (`implAt: cardSched.interval || 0`, `struggleStreak: 0`)
*before* `reimplementStatus` ever runs on it. This guard exists specifically to
stop every mature (long-interval) card from instantly flooding the UI with
"verify" badges the first time this feature was deployed — removing or
bypassing this migration path will reintroduce that bug for any user upgrading
from an old save.

There's an equivalent migration for the old single `newPerDay` setting being
split into `priorityPerDay`/`standardPerDay` — old saves get their total mapped
60/40 onto the new sliders, defaulting `priorityCategories` to the embedded
preset if absent. Both migrations are duplicated in two places: the on-load
`useEffect` and the manual `onImport` handler (restoring an exported backup) —
**keep these two code paths in sync** if either migration changes.

## Things to watch out for when editing this code

1. **No JSX, no build step.** The app is hand-written `React.createElement(...)`
   calls compiled to nothing — it's served as-is via an import map pointing bare
   `react`/`react-dom` imports at esm.sh. Don't introduce JSX syntax; it won't
   build because there is no build.

2. **Service worker cache busting.** `sw.js` precaches `index.html`, `app.js`,
   `manifest.json`, and icons under a versioned cache name
   (`const CACHE = 'srs-prep-vN'`). **Every deploy that changes `app.js` (or any
   precached file) must bump `vN`**, or returning users' service workers will
   keep serving the stale cached `app.js` indefinitely and never see the update.
   Current version: v6 (verify against the live repo before assuming this is
   still current).

3. **All `risk` values are static per-problem data, not computed.** Don't
   confuse `RISK_RANK` (the sort-priority lookup table: `High: 0, Med: 1, Low: 2`)
   with anything dynamic — it's just a string→int map for sorting card metadata
   that was hand-assigned when each problem was seeded.

4. **`order` is literal spreadsheet row position**, grouped by category because
   that's how the source spreadsheet was organized. Don't assume `order` encodes
   anything about difficulty, recency, or priority beyond "where it sat in the
   sheet."

5. **The shared `highRemaining` counter is mutated in place** across sequential
   calls to `selectFromPool` for different pools, specifically so the High-decay
   cap is global rather than per-pool. Don't accidentally give each pool its own
   independent counter — that would silently double (or N-tuple) the effective
   daily High-risk cap.

6. **`localStorage` is the only persistence layer** — there's no backend. Export/
   Import (in Settings) round-trips the entire app state as a downloadable JSON
   file; this is the only backup mechanism. Any new persisted field needs to be
   included in both the export payload and the import/migration handler, or it
   silently won't survive a backup/restore cycle.

7. **The codebase is otherwise small enough to read in full** (~294KB but mostly
   seed data — the actual logic is maybe a few hundred lines). When in doubt
   about current behavior, read the real file rather than relying on this
   document, which describes intent and known issues as of the time it was
   written and can drift from the live code.
