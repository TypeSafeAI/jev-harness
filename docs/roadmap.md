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
benchmark, durable log store, or production host. Phase 1 below extracts the
validator, payload builder, and offline fixture bench; a live transport,
durable log store, and production host remain out of scope. See the
[hardening index](hardening/README.md) for the ten separate findings and limits.

## 1 · Extract the rest of the Week 1 harness

Source: `typesafe-playground/lib/harness/`, re-diffed against canonical merged
`main` commit `6fe5967dc020521a0731682b06c4d8eeeab95ffb` (playground PR #41).
The [offline extraction check](verification/phase1-extraction-2026-09-23.json)
confirms all original 20 fixtures and normalized v1 requests remain unchanged. The
[hardened extraction adaptations](architecture.md#question-sets) retain the
existing decision table and require the exact model pin before transport and
on real-source replies. The original historical run links remain pinned to
the revisions that produced them.

- [x] `validate.ts` and its pinned schema dependency (`zod` 4.6.5), reviewed separately; the playground's diff parser is extracted as `src/contract/diff.ts`
- [x] `review.ts`: question set, `buildReviewPayload`, injected transport, and request types (`src/contract/payload.ts`)
- [x] `run.ts`, `proposer.ts`, `mock.ts`, `fixtures.ts`, `load.ts`, and `bench.ts` (under `src/benchmark/`; `load.ts` is Node-only)
- [x] Original 20 synthetic fixture files and applicable proposal-review tests (the route test stays in the playground)
- [x] Playground consumes a pinned vendored revision: [PR #45](https://github.com/TypeSafeAI/typesafe-playground/pull/45), merged at `e5fc697f4a7b995b045000c0e3f915df5a7df198`; source pin `a8a1a45a147c06abd197ff5d6004fb78e682e3a6`
- [x] Preserve the hardening changes rather than replacing them with an older decision table
- [x] Test the exact post-validation wire payload, including supported criteria and absent labels

Exit: reproduce the original mock pipeline totals, retaining the ambiguity
label history and separating legitimate abstentions. These scripted outcomes
are not new live measurements. Apply the [evaluation plan](hardening/09-evaluation.md).

Phase 1 is complete. The [consumer delivery evidence](verification/phase1-consumer-2026-09-23.json)
records byte-identical source and original fixtures, exact HTTP payload and
cancellation checks, both production fixture traces, all mock API arms and the
full hosted browser suite. Host authorization, production conformance and
calibration remain separate work.

Mock pipeline totals ([offline run](verification/phase1-extraction-2026-09-23.json), `pnpm bench:review`, asserted in
`tests/proposal-review-bench.test.ts`): base catches 7/20 bad proposals (the
validation rejects), base+Jev catches 20/20, and base+Jev holds 2/20 good
proposals, both on the two `ambiguous` fixtures whose good arm expects
`proposal_only` because asking is the correct move. These match the playground
at the extraction SHA. They are scripted mock values, not measurements of Jev.

Issue #4 added one `clean` fixture,
`clean-read-before-edit-content-not-in-evidence` (a read-first good arm and a
well-formed, unsupported guessed edit as the bad arm). The bad rationale claims
the ignored legacy `maxRetries` field controls upload retries; its patch changes
that field and leaves the documented `transientRetryLimit` unchanged. Both arms
quote only the task, but v1 supplies all fixture files to Jev and cannot establish
read history. The sole `evidence_supports` miss is scripted; live review may flag
other questions. The bad arm passes validation, so the
[offline totals](verification/read-before-edit-fixture-2026-09-23.json) for that suite are:
base 7/21, base+Jev 21/21 bad caught, base+Jev 2/21 good held, and 42/42 expected
verdicts met. The 20-fixture numbers above remain the extraction baseline.

The [prospective issue #5 follow-up](calibration/2026-09-23-followup-plan.md)
adds four synthetic pairs without changing the prior 21 cases or their labels.
The new coverage includes a correct edit with a false causal rationale,
copy-before-sort versus sort-before-copy, a rationale injection that accompanies
a wire-code change, and conflicting current retention policies. All new arms
pass structural validation. The
[25-fixture offline run](verification/calibration-followup-2026-09-23.json)
reports base 7/25 bad caught, base+Jev 25/25 bad caught, 3/25 good held for
clarification, and 50/50 expected verdicts met. These are scripted mock outcomes.
The separately recorded [live follow-up](calibration/2026-09-23-followup.md)
completes the issue #5 investigation. Its confidence-only catch and unexpected
good holds support retaining the fixed `0.8` floor as uncalibrated, not selecting
an optimum from this sample.

The [question set v4 candidate](architecture.md#question-sets) changes evidence
support to distinguish a requested change from a defect claim while checking
every material factual or causal claim. It retains v1, v2 and v3 questions as
frozen provenance and changes no fixture,
label, model pin, threshold or decision rule. The [live development comparison](calibration/2026-09-25-question-set-v4.md)
retains all candidates and the separate frozen confirmation. Offline wire-contract
checks do not establish semantic improvement. These adaptive development
candidates are not held-out calibration.

## 2 · Host seams

- [ ] Rust `ProposalReview<C>` seam, fakes, and event wiring; no provider HTTP in the pure crate
- [ ] Evidence-only receipt card, without approval controls
- [ ] Document receipt-to-host-event mapping and preserve model/source/mode provenance
- [ ] Complete the [host-conformance cases](hardening/08-host-conformance.md) in each real host before a gated pilot

## 3 · Tool router (Tier 1, second seam)

- [x] `ToolRouter` contract: intent + host-available tool ids → top-k descriptors, clarification, confidence/probability floors, deterministic cost policy
- [x] Offline synthetic comparison: full vs selected schemas, explicit load/eviction state, receipts and cost/token proxies (`pnpm bench:routing`)
- [x] Interactive synthetic browser demonstration: Next.js dark full-width UI, progressive disclosure, key override, reported usage, responsive layouts, paired metrics and receipt export; `pnpm demo`
- [x] Experiment: N tools in context vs Jev top-k, measured on provider-reported tokens and correct-tool rate. [Three-repetition live report](routing-evaluation/2026-09-23.md): aggregate input reduction accompanies a multi-step tool-use regression; no dollar-cost or task-quality claim.
  - Runner and artifact parsing are verified offline with fakes: `pnpm experiment:routing` (see the [experiment protocol](routing.md#experiment-protocol-n-tools-in-context-vs-jev-top-k)). The linked live report keeps its measured results separate from mock checks.
- [x] Optional local live-routing example host, separate from the exported pure package: persisted personal-key override, explicit provider calls, measured usage and failure handling. [Manual smoke receipt](verification/live-routing-2026-09-22.json); the multi-task experiment is linked above.

- [x] Local Codex CLI arena with four selectable synthetic examples; synthetic MCP tools, full versus Jev-selected exposure, actual call/usage records. This does not complete the repeated cost/quality experiment above.

- [x] Arena-only interface with overlay evidence, local run snapshots and matching-task performance history. Storage/unknown-value behavior is covered by [offline verification](verification/arena-history-2026-09-22.json); [live routing evidence](routing-evaluation/2026-09-23.md) is separate from those UI checks.

- [x] Local lessons from each settled Arena simulation: measured tradeoffs, evidence-first recommendations, repeat-run evaluation guidance and versioned export. [Offline verification](verification/arena-lessons-2026-09-22.json); this is not automated quality evaluation.

- [x] Harness adoption workflow: explicit shadow/lean context preparation, runnable synthetic adapter, copyable coding-agent handoff and separate human assessments for repeated-run inspection. This is integration scaffolding; each production host still needs conformance and measured quality/overhead evidence. See [integration](integration.md).

- [x] Host-declared tool prerequisites: a routed patch can retain fixture-read access without changing Jev's selected roots or granting execution authority. The Arena records the complete menu, and the repeatable experiment opts in with `--with-prerequisites`. [Offline verification](verification/tool-prerequisites-2026-09-25.json) covers bundle withholding, artifact replay, live progress and saved-run exposure. Live effectiveness remains a separate experiment.

- [x] [Fixture host revision 1](routing.md#fixture-host-revision-1): bounded literal search and retained, unevaluated test drafts, with shared recording limits and artifact/history provenance. Default Arena exposure, routing semantics, frozen fixtures, labels and mocks stay unchanged.
- [x] [Measure the integrated host capability and routing v4 candidate](routing-evaluation/2026-09-25-routing-v4.md), then assess retained test source offline without executing it. Recorded drafts remain separate from agent assessments of their content; no proposed source was executed.
- [x] [Routing semantics v2](routing.md#inspector-semantics-v2): describe the deterministic inspector's source-context capability and generalize its grounding note. Preserve exact v1 wire semantics, catalog replay, prerequisite artifacts, and readable Arena history; introduced setup revision 3.
- [x] [Routing instruction v3](routing.md#source-evidence-instruction-v3): distinguish source evidence that advances a clear task from ambiguity requiring clarification. Preserve v1/v2 wire bodies and replay, reuse the v2 catalog, and move new Arena runs to setup revision 4.
- The [v3 diagnostic regressed](routing-evaluation/2026-09-25-development.md#routing-only-instruction-diagnostic); retain its exact instruction and evidence, but reject deployment.
- [x] [Routing instruction v4](routing.md#requested-operation-instruction-v4): distinguish the requested operation or deliverable from a preliminary read, retaining source inspection as evidence for an explanation. Preserve v1/v2/v3 wire bodies and replay, reuse the v2 catalog, and move new Arena runs to setup revision 5.
- [x] Record the [v4 routing-only diagnostic and frozen repeat](routing-evaluation/2026-09-25-routing-v4.md), including every malformed distribution. These are selection measurements, not delivered-answer scores or evidence of overall saturation.
- [x] Complete [full CLI measurement of routing v4](routing-evaluation/2026-09-25-routing-v4.md#end-to-end-comparison) with fixture host revision 1 and proposal-review v4, at the unchanged `0.7` routing confidence floor with frozen tasks, labels, mocks, costs, and prerequisites. Retain the control, initial candidate and frozen repeat, including every unavailable outcome and blinded answer assessment. Full saturation remains unproven because malformed provider distributions persist.

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
