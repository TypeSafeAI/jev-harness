# Harness adoption and improvement workflow

**Goal:** Make the Arena a clear starting point for adapting Jev to an existing coding harness, with a concrete agent prompt, reusable context preparation, and a measured improvement loop.

**Architecture:** Keep the existing runtime and execution in the host. Add an additive pure routing composition helper, an offline runnable host example, an Integrate tab, and browser-local human assessments kept separate from immutable run evidence. No new provider transport, dependencies, verdicts, model pins or runtime.

**Design:** Preserve charcoal #0f1012, panel #17181b, divider #2b2c32, text #f4f4f5 and rose #f386a1. Use existing system sans for instructions and monospace for code. Compare → History → Integrate tabs communicate the workflow; the signature element is a small host/Jev/host flow showing where authority stays. Long prompts, measurements and technical guidance are progressively disclosed in existing overlay drawers.

## Completion requirements

- [x] Review Compare, History, settings, usage, empty, pending, completed, failure and mobile states; record concrete findings and fixes.
- [x] `prepareToolContext` composes existing routing and context APIs for explicit shadow or lean adoption, keeps full/selected evidence, handles cancellation and all routing outcomes without introducing execution. Test one provider call, immutable snapshots, previous context transitions, configuration validation, failure and abort behavior.
- [x] Offline `examples/integration/host.ts` demonstrates the actual public API, injected router, explicit outcome handling and host boundaries. Existing transport/phase-1 PRs remain separate.
- [x] Integrate offers a copyable/downloadable agent prompt with adoption mode, exact repository paths/APIs, host discovery, source pinning, egress, credentials, cancellation, freshness, tests, observability and rollout/rollback instructions. It does not include keys, private answers or fixture labels in provider instructions.
- [x] Explain the improvement loop: frozen tasks, baseline/shadow/lean, setup and model revisions, quality review, actual input/output/cache/latency including Jev, partial/unknown outcomes, matched repeated comparisons and one-variable changes.
- [x] Let users record human answer assessments for either lane and a bounded next-experiment note. Keep assessment provenance distinct, preserve history schema and credentials, surface storage failure, restore on refresh and include annotations in exports. History shows reviewed coverage and can filter to paired passing assessments without claiming automatic correctness.
- [x] Link lessons to integration; preserve keyboard tab navigation, overlay focus and active comparison controls.
- [x] Update architecture, README, roadmap and integration guide with reproducible commands and honest limits; publish verification evidence.
- [x] Run offline tests, typecheck, isolated build, secret/diff checks, synthetic browser checks across screen sizes, and independent spec/code review. No automated provider calls or private egress.
Delivery gate: signed PR, addressed review conversations, exact-head green CI, squash merge and verified dev preview. Record completion in the PR timeline; audit all requirements before completing the goal.

## Execution

1. Implement/test the routing helper and offline integration example independently from the UI.
2. Implement/test local assessment storage, summaries and prompt generation; integrate the new UI using existing components.
3. Review rendered states and repair findings; verify the actual copied/downloaded handoff and history lifecycle.
4. Complete documentation, independent review and delivery. The earlier lessons PR is completed progress, not completion of this broader goal.

## Verification

See the [UI audit](../../verification/harness-integration-ui-audit-2026-09-22.md) and [recorded checks](../../verification/harness-integration-2026-09-22.json). Independent spec and quality reviews passed after the documented recovery, concurrency and accessibility fixes.
