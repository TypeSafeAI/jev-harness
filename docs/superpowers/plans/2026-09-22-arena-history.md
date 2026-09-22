# Arena history implementation plan

> Execute in the existing isolated demo worktree. Preserve the pure package and host execution boundaries. Complete each verification before a signed commit.

**Goal:** Make the Agent Arena the only application page and provide durable local results with honest performance comparisons over time.

**Architecture:** The root page renders one Arena with Compare and History views. A browser-only, versioned local-storage adapter saves bounded complete/partial run snapshots; a pure metrics layer filters comparable runs by fixture and setup revision. The existing host and parallel CLI execution stay intact.

**Tech stack:** Next.js App Router, React, TypeScript, native localStorage and SVG; no dependencies.

## Execution ledger

- [x] Persistence: add `examples/arena/history.ts` and `tests/arena-history.test.ts`; cover valid snapshot round trips, invalid JSON, unknown values, duplicate ids, retention, storage failure, setup isolation and metric aggregation. Keep at most 30 runs within a 2 MB serialized budget; report unsuccessful saves without breaking current results. Credentials are never part of the snapshot.
- [x] Lifecycle: add `components/use-arena-history.ts`; save once when a request settles, including cancelled or partial outcomes, restore a saved run after reload, and distinguish live from saved evidence. Filter key storage events so history synchronization never cancels a run.
- [x] Single interface: root renders Arena; remove the Routing room and Example lab page/components and obsolete verifiers. Preserve `/arena` as a redirect to `/`. Replace cross-page navigation with Compare/History tabs within the Arena; retain key and usage dialogs.
- [x] Clarity: use a compact full-width task toolbar, use native radio cards with purpose and saved-run counts, move explanatory setup into a modal drawer, show useful empty state before running, retain current lane progress and clear saved-run timestamps. All primary details cover the content instead of expanding the page; Escape and Close restore focus. Use existing rose/charcoal tokens and restrained typography.
- [x] History UI: add `components/arena-history.tsx`; provide per-task input/time trends, paired run rows, count of excluded incomplete/unknown samples, reopening evidence, and explicit clear-history control. Show complete answers and receipts when reopened. Compare only matching fixture/setup versions; do not mix tasks or claim quality/cost wins.
- [x] Verification: extend browser acceptance for sole-page navigation, repeated offline runs, refresh/reopen, cross-tab synchronization, cancelled runs, key changes, storage errors, history clearing, empty/single/multiple samples and responsive/keyboard behavior. Update the guide/architecture/README/roadmap. Run typecheck, offline tests, isolated production build, secret checks and browser checks; request fresh code review.
- [ ] Delivery: signed commit, PR, terminal CI, no open review conversations, squash merge, preserve the running dev preview, and audit the complete goal against current evidence.

## Verification evidence

See [arena-history-2026-09-22.json](../../verification/arena-history-2026-09-22.json). Fresh review identified unavailable-storage download loss and incomplete accessible history labels; both were fixed and re-reviewed. The production build and browser checks use synthetic streams without provider or live CLI calls.
