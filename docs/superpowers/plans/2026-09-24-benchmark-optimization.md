# Harness benchmark optimization

> **For agentic workers:** Use subagent-driven development for independent tasks, with spec then quality review. This ledger records an adaptive experiment; each candidate follows an observed failure and an offline regression test.

**Goal:** Improve both routing and proposal review through batches of 50–200 measured cases, patching demonstrated failures and checking saturation without changing frozen labels or weakening policy.

**Architecture:** Keep transport and CLI work in example hosts. Keep contract and routing pure. Separate experiment instrumentation, routing fixes, and any versioned review-question changes into reviewable commits/PRs. Preserve the existing UI and show changes at http://127.0.0.1:4200/.

**Tech stack:** TypeScript, pnpm, node:test, isolated Codex CLI, pinned Jev 1.13.0.

## Protocol and gates

- Starting revision: `8367ffc2d560489881f623f35f5650cada42eeb5`; baseline typecheck and all 198 offline tests passed.
- Routing batch: the existing 19 tasks × 3 repetitions = 57 paired cases (114 arm observations). Proposal-review batch: all 25 frozen pairs = 50 reviewed pipeline cases. Record attempts, unavailable outcomes, latency and reported usage separately from case counts; no automatic retries or hidden exclusions.
- Freeze task/fixture bytes and labels. Keep historical artifacts. Never pass evaluation metadata to providers. A repeated case is repeatability evidence, not a new case.
- Keep `jev-1.13.0`, review threshold 0.8, routing confidence/probability floors and decision table fixed. Version question wording changes; keep old question sets for paired evaluation.
- Pin proposer model and capture requested model, CLI version, source SHA, file hashes and candidate configuration. Preserve auth-only isolated CLI home, synthetic-only input, bounded output and cancellation.
- Use score after the call only. Retain the existing correct-tool score, but expose rejected tool calls and preserve answers/proposals separately so a higher score is not mistaken for task completion.
- Performance objective: maximize frozen benchmark correctness first, with no new false permits or loss of appropriate clarification; compare input, cached input, output, and latency only on equivalent outcomes. Do not claim dollar savings from raw tokens.
- Evaluate one hypothesis at a time. Continue when a miss has an actionable cause; repeat a frozen winner for confirmation. Perfect observed scores establish saturation only of this synthetic suite, not calibration or production guarantees. Report residual failures honestly if saturation has not been achieved.
- Automated tests stay offline. Live batches are manual experiments explicitly authorized by this goal; keys remain in the host environment and never enter artifacts.

## Work ledger

- [x] Inspect current code, historical failures, fixtures, policy, and host isolation.
- [x] Create isolated worktree and verify clean baseline.
- [x] Start optimization dev preview on port 4200 (session 5256).
- [x] Add tested measurement controls: explicit proposer model and review experiment attempt/usage accounting.
- [ ] Record fresh frozen routing and review baselines.
- [ ] Routing candidate: retain host-declared read prerequisites for patch/test tools, with availability/cost/cancellation checks; test before measurement.
- [ ] Investigate inspect-task routing misses from sanitized evidence diagnostics; fix semantics only with a new version when justified.
- [ ] Review candidate: address the mismatch between questions about edits/defects and useful diagnostic reads; version wording, preserve all four questions and fixed threshold, and compare both arms with frozen fixtures.
- [ ] Run 50–200-case candidate batches, analyze all failures, patch demonstrated causes, and repeat until benchmark saturation is demonstrated.
- [ ] Confirm on another frozen repeat; independently review labels/metrics and document limitations.
- [ ] Validate typecheck, tests, secrets and build; review spec then quality; signed commits and scoped PRs; resolve addressed feedback and merge with green exact-head CI.

## Evidence

- Initial offline logs: `/tmp/jev-opt-install.log`, `/tmp/jev-opt-baseline-tests.log`.
- Historical routing: `docs/routing-evaluation/2026-09-23.md` and linked raw artifacts (multi-step capability loss; inspect misses).
- Historical review: `docs/calibration/2026-09-23-followup.md` and raw receipts (47/50 labels, three unexpected good holds, zero bad permits).
- Existing unrelated PR #43 concerns a context-scoring shadow experiment; leave its branch and files untouched.
