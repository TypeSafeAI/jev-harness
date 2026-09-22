# Routing demonstration implementation plan

Goal: demonstrate explicit tool availability, schema loading, and inspectable routing without introducing a runtime or changing proposal review.

Architecture: pure TypeScript catalog and selection policy consume normalized choice evidence from a host adapter. A separate local, synthetic demo assembles context and records comparisons. No provider HTTP client, execution, or context scoring.

## PR 1 — routing and evaluation

- [x] Add `tests/routing.test.ts` for catalog validation, compact requests, closed-set evidence, confidence, clarification, budget, unavailable tools, deterministic cost ordering, and failure receipts. Run `pnpm test` and confirm the new behavior is missing.
- [x] Implement `src/routing/{types,catalog,route,context,index}.ts`; export from `src/index.ts`. Catalogs carry object schemas but no handlers. Reject unknown/duplicate ids, invalid distributions and mismatched models. Snapshot adapter inputs before awaiting.
- [x] Add synthetic scenarios in `examples/routing/scenarios.ts`, paired comparison and `scripts/bench-routing.ts`. Assert correct-tool inclusion, cheapest acceptable choice, clarification and context accounting in `tests/routing-bench.test.ts`.
- [x] Update architecture, roadmap and README with the experiment boundary, model pin, units, adapter mapping and remaining live-measurement gate.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm check:secrets`, and the offline benchmark before `git commit -S` and PR creation.

## PR 2 — browser demonstration

- [ ] Write integration tests for a loopback-only static demo server, supported assets, methods and missing files.
- [ ] Implement a no-dependency browser UI under `examples/routing/`: synthetic chat scenarios, lean/full toggle, availability controls, loaded/evicted schema state, policy reasons, paired context metrics and JSON receipt download.
- [ ] Build browser modules with the pinned TypeScript compiler. Serve only allowlisted generated modules/static assets from a loopback server. No task input reaches a server or provider.
- [ ] Browser-check scenario changes, availability, modes, clarification, download, narrow layout and keyboard focus. Record automated coverage and human accessibility gap distinctly.
- [ ] Re-run verification and create a signed commit and stacked PR. Inspect hosted checks; do not merge.
