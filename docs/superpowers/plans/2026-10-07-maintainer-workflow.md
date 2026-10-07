# Maintainer workflow implementation plan

**Goal:** Deliver the Arena refresh, then make repository boundaries, offline verification, and contribution paths easier for agents and humans to follow.

**Architecture:** Keep the pure root, Node adapters, and browser UI separate. Use the existing TypeScript compiler to inspect resolved dependencies instead of adding a parser or dependency. Optimize repeated UI derivation without changing stored evidence or provider policy.

**Tech stack:** TypeScript, Next.js, React, node:test, pnpm. No dependency changes.

## Delivery 1: Arena usability and fixture MCP

- [x] Verify the current UI/MCP changes with typecheck, tests, build, secret scan, and offline browser checks.
- [x] Review the diff; fix actionable review findings.
- [x] Sign the commit, rebase onto current main, and verify again.
- [x] Push, open a focused PR, wait for exact-head CI, and squash merge.

## Delivery 2: Agent and maintainer workflow

- [x] Add `tsconfig.core.json` covering `src/index.ts`, `src/contract`, and `src/routing`, with no ambient Node types. Add `scripts/check-boundaries.mjs` using the compiler's resolved file inventory to reject adapters, UI, benchmark code, and unreviewed dependencies in that graph.
- [x] Add offline tests for allowed core dependencies and rejected host, UI, benchmark, and external paths, plus the actual resolved graph. Verify rejected dependency paths and unresolved Node imports with a compiler fixture. Core diagnostics must pass before the inventory is accepted.
- [x] Add `pnpm check:boundaries` and `pnpm verify` (boundaries, typecheck, tests, build, secret scan). Run the boundary check in CI.
- [x] Memoize `analyzeRun` and saved-example counts in `components/arena.tsx`, keyed by their actual inputs. Preload the local body font in `app/layout.tsx` so it is discoverable from the document. Verify the comparison/history/Settings/browser flows; do not claim latency savings without measurements.
- [x] Add a task-oriented development guide: setup, module ownership, change matrix, failure debugging, provenance, performance workflow, and signed PR delivery. Link it from README, CONTRIBUTING, AGENTS, and llms.txt.
- [x] Add a numbered architecture flow and a dependency diagram to `docs/architecture.md`; distinguish pure evidence, host I/O, and unavailable public-host execution. Update the roadmap with only delivered maintenance work.
- [x] Run `pnpm verify`, offline browser checks, and fresh review.

Delivery uses a signed topic branch and a focused PR. Its live GitHub status is
the receipt for exact-head CI and squash merge; this plan does not substitute
for that evidence.

## Completion evidence

Arena delivery: PR #59 merged as `a2f4aa986c37cb5390157ce66235a9a55c4ea144`; both CI jobs passed and GitHub verified the merge signature. The maintenance review identified an inventory-only Node-import gap; requiring core diagnostics and adding an isolated compiler regression addressed it.

Record actual commands and outcomes in the PRs. Check signing, review state, and terminal CI before merge. Re-read remote main after each merge. No live provider runs, dependency upgrades, private-source egress, or policy changes are part of this work.
