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
- [x] Start optimization dev preview on port 4200 (server-key session 57149 replaces initial session 5256).
- [x] Add tested measurement controls: explicit proposer model and review experiment attempt/usage accounting (signed `e75b77a`, `cbf916e`; PR #44).
- [x] Record a fresh frozen review baseline and retain all development versions in [the review report](../../calibration/2026-09-25-question-set-v4.md).
- [x] Finish the fresh matched routing baseline using the complete pinned CLI package. Retain version-drift, cancelled, authentication and package-layout failures in [the routing ledger](../../routing-evaluation/2026-09-25-development.md).
- [x] Routing prerequisites: pure bundle and Arena progress changes merged in PR #45. Matched live measurement completed; patch calls returned in 9/9 trials versus 0/9 selected-only.
- [x] Freeze inspector semantics v2 at signed `ed01e8d`, preserving historical catalogs, receipts and artifact replay; measurement completed, with all nine inspections still held below the fixed confidence floor.
- [x] Review wording and evidence: PR #46 merged question set v4 with every intermediate run and a separate frozen confirmation. The [report](../../calibration/2026-09-25-question-set-v4.md) limits the result to the synthetic development suite.
- [x] Add and independently review bounded synthetic search and test-draft handlers for the observed `No handler` failures. Frozen signed `050df77` retains exact proposed source without executing it; 253 offline tests passed. Its full live batch and blinded assessment are complete. The separately integrated handler patch is merged in PR #47 with 252 offline tests on current main.
- [x] Test routing instruction v3: source access can advance a task without producing the final answer. Spec and quality review passed after fixing a stale browser setup assertion; 241 tests and 16 fake browser checks passed. The routing-only diagnostic regressed from 47/57 expected roots/dispositions under v2 to 36/57 under v3. Reject deployment and retain the source and measurements.
- [x] Measure instruction v4 on frozen source `fb7226c`: [initial batch and repeat](../../routing-evaluation/2026-09-25-routing-v4.md) match 55/57 and 54/57 expected dispositions. All clear tool requests match; five malformed distributions across both batches remain unavailable. No policy, label, task or model changes.
- [ ] Measure the integrated v4 candidate `5f58cd2` against current-main control `5df1a92`, with the same pinned CLI and fixture host revision 1, then apply the frozen blinded-output rubric. Both source checkouts remain frozen during their full runs.
- [ ] Run 50–200-case candidate batches, analyze all failures, patch demonstrated causes, and repeat until benchmark saturation is demonstrated.
- [ ] Confirm on another frozen repeat; independently review labels/metrics and document limitations.
- [ ] Validate typecheck, tests, secrets and build; review spec then quality; signed commits and scoped PRs; resolve addressed feedback and merge with green exact-head CI.

## Evidence

- Initial offline logs: `/tmp/jev-opt-install.log`, `/tmp/jev-opt-baseline-tests.log`.
- Historical routing: `docs/routing-evaluation/2026-09-23.md` and linked raw artifacts (multi-step capability loss; inspect misses).
- Historical review: `docs/calibration/2026-09-23-followup.md` and raw receipts (47/50 labels, three unexpected good holds, zero bad permits).
- Existing unrelated PR #43 concerns a context-scoring shadow experiment; leave its branch and files untouched.
- Fresh review baseline: `/tmp/jev-performance-2026-09-24/review-baseline.json`, clean `cbf916e`; 50 cases, 43 provider attempts, no retries or unavailable results, 47 expected verdicts met. All bad arms remain held. The three unexpected good holds match the historical failure categories. Exact requests, answers, file hashes and timing are retained in the artifact.
- Frozen routing baseline: clean `e75b77a`, requested `gpt-6-sol` with medium reasoning, 57 paired cases planned; log and provenance under `/tmp/jev-performance-2026-09-24/`. No source edits while running.
- Prerequisite candidate offline proof: [verification](../../verification/tool-prerequisites-2026-09-25.json). The browser regression also checks that opening incomplete history clears another run's transient menu. A passing fake run is not a live performance result.
- CLI pinning correction: an absolute injected executable deliberately skips authentication in the test seam, and the standalone native binary lacks its companion tool host. The corrected runner pins the complete native package, resolves `codex` through its `bin` directory, and checks all package hashes before and after the batch. The [routing ledger](../../routing-evaluation/2026-09-25-development.md) retains the failed attempts and a successful returned-tool preflight.
- Completed full CLI comparisons use clean source revisions `e75b77a` (selected-only), `2eb8bcd` (prerequisites), `ed01e8d` (prerequisites plus inspector semantics v2), and `050df77` (fixture handlers). Their overlapping execution limits timing comparisons. All raw artifacts, source manifests and blinded assessments are retained in the routing report. The v3 routing-only diagnostic regressed. V4's first two secret-store startups timed out before provider work; the third launch and a frozen repeat completed after access was restored, as recorded in the [follow-up](../../routing-evaluation/2026-09-25-routing-v4.md).
