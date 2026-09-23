# Routing experiment review fixes

> Execute with the review and verification workflow; all tests use injected providers and synthetic CLI processes.

**Goal:** Make PR #31's saved measurements and cancellation behavior trustworthy enough to run the linked experiment in issue #2.

**Architecture:** Keep routing policy unchanged. Fix the experiment host's lifecycle and validate the artifact fields consumed by scoring/rendering. Keep unknown input/output counts independent and retain failed attempts in denominators.

## Tasks

- [x] Merge current main into the PR worktree and preserve both the Integrate guidance and experiment command in README.
- [x] Reproduce asymmetric usage with a completed trial reporting input `100`, output `null`. Assert the table shows input `100` and output `unknown (1/1)`. Add `reportedOutputKnown`; derive each column's unknown count from its own known count.
- [x] Reproduce failed/cancelled truncated traces. Assert `scoreTrial(...).correct === false` and `correctKnown === 1`; handle failure before truncation.
- [x] Reproduce artifact corruption with infinite numeric fields, invalid status/outcome pairs, missing canonical metadata, malformed IDs and conflicting trial identities. Validate all fields consumed by the table and scorer; reject contradictions before rendering. Preserve raw unknown values and recompute summaries.
- [x] Wire SIGINT/SIGTERM through an AbortController to `main` and `ExperimentDeps.signal`. Await host teardown, save partial evidence marked cancelled, and return a nonzero exit. Test with an injected fetch and synthetic detached CLI; no provider calls.
- [x] Run focused tests after each fix, then frozen install, typecheck, all tests, production build, secret/diff checks and the offline CLI/table round trip.
- [x] Independently review the fixes; all spec and quality findings addressed.
- [x] Publish signed follow-ups, resolve addressed discussions, and merge after exact-head CI/review. [PR #31](https://github.com/TypeSafeAI/jev-harness/pull/31) merged at `2507473`; checks and secret scan passed on both its head and main.

No threshold, question, model pin, permission or proposal-execution changes. A completed fake run is not the live experiment requested by issue #2.
