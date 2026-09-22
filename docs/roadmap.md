# Roadmap

Status describes this hardening branch, not an automatically deployed runtime.
Dates and phases are planning targets, not delivery promises.

## 0 · Contract home and hardening

- [x] Repository in the independent TypeSafeAI community organization
- [x] Types and decision table originally extracted from playground PR #41, head `245167d`, then hardened here
- [x] Runtime invariants, immutable policy metadata, and offline regression tests
- [x] Optional bound-receipt audit, benchmark-only API, and evaluation/blinding helpers
- [x] Documentation and host-conformance specification
- [ ] Signed hardening commits and passing pinned checks on each current PR head before merge

These additions do not constitute a full validator, transport, runner, live
benchmark, durable log store, or production host. See the
[hardening index](hardening/README.md) for the ten separate findings and limits.

## 1 · Extract the rest of the Week 1 harness

Source: `typesafe-playground/lib/harness/` on `feat/proposal-review`. Do this
**after PR #41 merges** so there is one canonical history to extract from.

- [ ] `validate.ts` and its pinned schema dependency, reviewed separately
- [ ] `review.ts`: question set, `buildReviewPayload`, injected transport, and request types
- [ ] `run.ts`, `proposer.ts`, `mock.ts`, `fixtures.ts`, `load.ts`, and `bench.ts`
- [ ] Original 20 synthetic fixture files and applicable proposal-review tests
- [ ] Playground consumes the shared package or a pinned vendored revision
- [ ] Preserve the hardening changes rather than replacing them with an older decision table
- [ ] Test the exact post-validation wire payload, including supported criteria and absent labels

Exit: reproduce the original mock pipeline totals, retaining the ambiguity
label history and separating legitimate abstentions. These scripted outcomes
are not new live measurements. Apply the [evaluation plan](hardening/09-evaluation.md).

## 2 · Host seams

- [ ] Rust `ProposalReview<C>` seam, fakes, and event wiring; no provider HTTP in the pure crate
- [ ] Evidence-only receipt card, without approval controls
- [ ] Document receipt-to-host-event mapping and preserve model/source/mode provenance
- [ ] Complete the [host-conformance cases](hardening/08-host-conformance.md) in each real host before a gated pilot

## 3 · Tool router (Tier 1, second seam)

- [x] `ToolRouter` contract: intent + host-available tool ids → top-k descriptors, clarification, confidence/probability floors, deterministic cost policy
- [x] Offline synthetic comparison: full vs selected schemas, explicit load/eviction state, receipts and cost/token proxies (`pnpm bench:routing`)
- [x] Interactive synthetic browser demonstration: Next.js dark full-width UI, progressive disclosure, key override, reported usage, responsive layouts, paired metrics and receipt export; `pnpm demo`
- [ ] Experiment: N tools in context vs Jev top-k, measured on token cost and correct-tool rate
- [x] Optional local live-routing example host, separate from the exported pure package: persisted personal-key override, explicit provider calls, measured usage and failure handling. [Manual smoke receipt](verification/live-routing-2026-09-22.json); the multi-task quality/cost experiment remains open.

- [x] Local Codex CLI arena with four selectable synthetic examples; synthetic MCP tools, full versus Jev-selected exposure, actual call/usage records. This does not complete the repeated cost/quality experiment above.

- [x] Arena-only interface with overlay evidence, local run snapshots and matching-task performance history. Storage/unknown-value behavior is covered by [offline verification](verification/arena-history-2026-09-22.json); repeated live evaluation remains open.

- [x] Local lessons from each settled Arena simulation: measured tradeoffs, evidence-first recommendations, repeat-run evaluation guidance and versioned export. [Offline verification](verification/arena-lessons-2026-09-22.json); this is not automated quality evaluation.

## 4 · Context scoring

- [x] Compare scoring/re-prefill costs with forfeited prefix-cache reuse. [Cost model](context-scoring-cost-model.md): no-go for integration code; conditional go for a synthetic shadow experiment
- [ ] Review data egress and run a shadow experiment on synthetic or consented context
- [ ] Make the integration decision from measured results, not token counts alone

## 5 · Later, with evidence

Real-host integration requires mediated tools, canonical session binding,
protected evidence, and independently enforced grants. A specialist proposer
experiment is separate from the reviewer. Calibrate thresholds on independently
labeled held-out examples before any claim of production error rates.
The [per-question look at the four development runs](calibration/2026-09-22-per-question.md)
is groundwork for issue #5, not that calibration.
Publish the source package only after the extraction, compatibility, and
verification gates are satisfied.

## Not planned here

A new agent runtime, executing model-proposed code inside this package, or
sending real source/identity/private memory to a provider without a reviewed
egress policy. A model verdict is never a grant of authority.

The offline routing experiment is independent of phase 1 extraction. Its scripted outcomes and byte/token proxies do not satisfy the live experiment exit criteria or establish execution-speed improvements.
