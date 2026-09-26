# Bounded host recovery for malformed routing distributions

> Use subagent-driven-development for implementation and independent spec/quality review. Automated tests use fake transports and CLI only.

## Objective

Improve the fixed routing benchmark without weakening the evidence contract. Routing v5 full measurement retains one unavailable response with total probability mass approximately 0.99. Keep that evidence intact. The separate proposal-review suite already matches all 200 observed expectations and is unchanged.

## Invariants

- Recovery belongs to the optional host adapter, never the pure exported harness.
- Use one to three identical physical requests under one global deadline and cancellation signal. Stop on every valid response, including clarification or low confidence; do not retry HTTP, transport, body-limit or other shape/model/closed-set failures.
- Retry only a complete pinned-model, in-range, leading-choice response whose sole structural defect is a probability sum outside the existing tolerance. Never normalize or change a probability, threshold, model, task, label or question instruction.
- Retain every attempt with sanitized structural evidence, counts, usage, duration and reason. Unknown usage stays unknown. Distinguish logical routing calls from physical provider requests in benchmarks and UI.
- Preserve historical artifacts/history without attributing recovery to old runs. Separate cohorts when host settings change.
- Preserve auth-only temporary CLI homes, fixture isolation, output/time limits and non-execution of proposed source.

## Tasks

- [x] Implement the bounded transport and accounting with focused failing tests first; preserve the one-attempt compatibility path.
- [x] Integrate explicit recovery provenance with benchmark artifacts, UI usage, Arena history and all affected parsers; do not silently hide extra provider work.
- [x] Independently review spec compliance, then code quality. Address the reproduced sum-order, abort, ledger consistency, and partial-usage findings.
- [x] Run intercepted browser verification for recovered, exhausted, interrupted, and malformed-terminal streams: 24 functional checks, no provider or CLI calls. The initial visual review found cramped attempt-table columns; replace them with labeled cards.
- [x] Select `probability_sum_only_v1` as the candidate demo default before source freeze. Keep the reusable adapter and CLI default at `none`, setup 6 controls readable, and effectiveness unmeasured.
- [x] Recheck the revised attempt cards: 29 intercepted browser checks passed at 320, 390, 768, 1440, and 1920 pixels; desktop/mobile screenshots inspected. Human keyboard-only and VoiceOver acceptance remain unperformed.
- [x] Run final typecheck, tests, production build, secrets, and diff checks for the activated candidate and attempt-card layout before signed source freeze.
- [x] Predeclare fixed 57-case initial and repeat routing measurements before live calls, in the retained manual plan. Keep all attempts and costs; compare first-attempt and final outcomes. Do not cherry-pick failures.
- [x] Execute and audit both routing-only batches against the signed source freeze.
- [x] If supported, run the full 57-pair CLI comparison and assess all retained output using the already-frozen blinded rubric. Confirm unchanged source, runner and pinned CLI package bytes.
- [x] Publish the final configuration and evidence in [PR #51](https://github.com/TypeSafeAI/jev-harness/pull/51). The fixed suite and output-quality gates support retaining the measured default. Preserve every unsuccessful candidate and limit claims to observed synthetic data.
- [ ] Verify final signed head, CI and addressed review conversations, squash merge, and update the existing dev preview.

## Completion criteria

All 57 fixed routing cases have their expected disposition with every failed physical attempt retained. All delivered clear-task outputs meet the unchanged rubric. Proposal review remains 200/200 on retained evidence with unchanged sources. These criteria concern the existing benchmark, not calibration or general reliability.

## Measured status

The [retained report](../../routing-evaluation/2026-09-26-host-recovery.md) records
171/171 expected routing outcomes across the two routing-only batches and full
57-pair CLI comparison. All 39 assessable routed outputs meet the frozen blinded
rubric; 18 correct clarification holds supply no authored output to assess.
Proposal review is unchanged at 200/200 retained expected verdicts. Every first
response was valid, so no live recovery benefit is claimed. The measured demo
default passes these fixed-suite gates. Final PR landing and dev synchronization
remain tracked above.
