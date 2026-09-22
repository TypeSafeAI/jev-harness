# Roadmap

Status as of 2026-09-22. Dates are targets, not promises.

## 0 · Contract home (this commit)

- [x] Repository in the TypeSafeAI community org
- [x] `src/contract/types.ts` and `src/contract/decide.ts`, extracted verbatim from `typesafe-playground` `feat/proposal-review` (PR #41, head `245167d`)
- [x] Decision-table tests, offline
- [x] README, architecture, agent guide, CI

## 1 · Extract the rest of the Week 1 harness

Source: `typesafe-playground/lib/harness/` on `feat/proposal-review`. Do this **after PR #41 merges** so there is one canonical history to extract from.

- [ ] `validate.ts` (zod; the playground's `zod` version is `4.6.5`)
- [ ] `review.ts` — question set v1, `buildReviewPayload`, `JevTransport` injection; the `RunPayload`/`Question` types come with it
- [ ] `run.ts`, `proposer.ts`, `mock.ts`, `fixtures.ts`, `load.ts`, `bench.ts`
- [ ] `fixtures/proposal-review/*.json` (20 synthetic fixtures)
- [ ] Port `tests/proposal-review*.test.ts` (route test stays in the playground)
- [ ] Playground imports this package instead of its own `lib/harness/` (or vendors it with a pinned commit until the package is publishable)

Exit: `pnpm test` here reproduces the mock bench totals (base 7/20, +Jev 20/20 bad caught; 2/20 good blocked on the ambiguous fixtures).

## 2 · Host seams

- [ ] Rust: `ProposalReview<C>` in OpenCoven `crates/coven-agents` with `ReviewVerdict { Permit, ProposalOnly, Reject, Unavailable }`, fail-closed, fakes only, `RunEvent::ProposalReviewed`
- [ ] Cave: `coven:proposal-review` receipt card, evidence only, no approve/deny controls
- [ ] Document the receipt → marker mapping here so both hosts render the same fields

## 3 · Tool router (Tier 1, second seam)

- [x] `ToolRouter` contract: intent + host-available tool ids → top-k descriptors, clarification, confidence/probability floors, deterministic cost policy
- [x] Offline synthetic comparison: full vs selected schemas, explicit load/eviction state, receipts and cost/token proxies (`pnpm bench:routing`)
- [ ] Interactive synthetic browser demonstration
- [ ] Experiment: N tools in context vs Jev top-k, measured on token cost and correct-tool rate
- [ ] Live host adapter using `typesafe-router` where it fits; [normalization boundary documented](routing.md#host-adapter-and-reuse), no duplicate provider client in this package

## 4 · Context scoring (Tier 2, measure-first)

- [ ] Cost model: (per-chunk scoring + re-prefill of assembled context) vs (cache reuse forfeited) on a real workload
- [ ] Shadow experiment on synthetic or consented context only
- [ ] Go/no-go on the numbers; no code before the cost model

## 5 · Later, only with evidence

- Real-host integration with mediated tools and canonical session binding
- A specialist proposer model trained against measured harness failures (a separate experiment; Jev itself is not fine-tunable)
- Calibrating the 0.8 threshold on more than 20 synthetic fixtures

## Not planned

- A new agent runtime or runtime ID
- Executing model-proposed code inside this package
- Sending familiar memory, identity, or real repository content to Jev without a reviewed egress policy

The offline routing experiment is independent of phase 1 extraction. Its scripted outcomes and byte/token proxies do not satisfy the live experiment exit criteria or establish execution-speed improvements.
