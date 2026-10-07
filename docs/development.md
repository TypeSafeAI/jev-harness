# Develop and review Jev Harness

Use this guide to find the owning module, reproduce a problem offline, and
prepare a change another maintainer can review without your session history.
Start with [the contract](../README.md), [architecture](architecture.md),
[roadmap](roadmap.md), and the applicable [agent instructions](../AGENTS.md).

## Set up and verify

Use Node.js 22+ and the exact pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` stops on the first failing check: import boundaries, typechecking,
offline tests, production build, and the secret pattern scan. CI also checks
real sharing responses and scans the full Git history with gitleaks. The local
command does not replace those hosted checks or human review.

For a focused iteration, run the tests for the module you changed:

```sh
pnpm exec tsx --test tests/decide.test.ts
pnpm check:boundaries
```

Do not regenerate the lockfile, alter an expected verdict, or disable a guard
just to pass verification. Use `pnpm verify` again before committing the final
patch. Sign commits with `git commit -S`.

## Find the owner before editing

| Task | Implementation | Read and verify |
| --- | --- | --- |
| Proposal shape, file scope, or diff parsing | `src/contract/validate.ts`, `diff.ts` | `tests/proposal-review.test.ts` |
| Decision or answer invariants | `src/contract/decide.ts`, `input.ts` | README table, `tests/decide.test.ts`, `tests/answer-invariants.test.ts` |
| Question payload or answer mapping | `src/contract/review.ts`, `payload.ts` | Question versions, `tests/review-payload.test.ts` |
| Tool selection or prerequisites | `src/routing/` | [Routing contract](routing.md), routing and prerequisite tests |
| Credentials, provider errors, CLI lifecycle | `examples/host/`, `app/api/` | [Demo guide](routing-demo.md), fake host and Arena tests |
| History, assessments, local lessons | `examples/arena/`, `components/` | History/assessment/lesson tests and browser verifiers |
| Styling and accessibility | `components/`, `app/globals.css` | [Interface guide](interface.md), keyboard and responsive checks |
| Synthetic tool behavior | `scripts/arena-mcp.mjs`, `examples/host/fixture-tools.mjs` | `tests/arena.test.ts`, `tests/fixture-tools.test.ts` |
| Standalone fixture MCP lifecycle | `scripts/fixture-mcp.ts` | `tests/fixture-command.test.ts` |
| Evaluation or measured claims | `src/benchmark/`, `examples/routing/` | [Evaluation rules](hardening/09-evaluation.md), linked run artifacts |

Use `rg` to locate the matching tests when a module has several suites. Read
code and test fixtures together. Historical run artifacts are evidence, not
current implementation guidance.

## Understand the boundaries

The [architecture diagram](architecture.md#dependency-direction) separates
reusable policy from adapters and presentation. `src/index.ts`,
`src/contract/`, and `src/routing/` may depend only on each other and the
reviewed schema dependency, zod. `pnpm check:boundaries` asks the pinned
TypeScript compiler to typecheck them and report their resolved file inventory, including type-only
imports, and rejects other source layers or packages. It checks all modules in
those core directories, including files not currently re-exported.

The checker is an import-direction guard. It does not prove runtime purity,
inspect zod's implementation, or authorize execution. Browser globals,
computed dynamic imports, and same-process JavaScript behavior still require
review. The existing review adapter measures elapsed time through its clock
helper; policy does not use that timing as evidence.

Keep I/O in host adapters. Keep fixture labels out of provider payloads. A
receipt digest detects changes relative to expected bindings; it does not
prove identity. The host owns source acquisition, egress, permission checks,
and any eventual execution outside this package.

## Trace a comparison failure

Follow the request in order:

1. `components/arena.tsx` sends a fixed case ID after an explicit click.
2. `app/api/arena/route.ts` checks the local origin, body, fixture, and host slot.
3. `examples/host/live.ts` validates credentials and limits; `jev-choice.ts`
   records provider attempts and validates the response.
4. The routing core selects a closed-set menu and expands required reading
   tools. Unavailable evidence stops the comparison.
5. `examples/host/codex.ts` creates isolated CLI homes and fixture MCP servers.
6. The browser consumes the event stream and stores returned evidence locally.

A hosted-origin rejection means the public page cannot run the local CLI.
Follow the displayed local setup instructions. A missing key is a settings
problem, not a model verdict. A CLI error calls for checking installation and
file-based sign-in on the host. Never print keys or raw provider/CLI errors to
improve diagnostics. Use fake transports to reproduce automated failures.

The standalone MCP provides a useful offline protocol check:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize"}' \
  | pnpm --silent mcp:fixture --case read
```

It exposes invented fixture files only. Pending patches are never applied,
tested, or executed. See [MCP setup](routing-demo.md#local-host-boundary).

## Performance and usability work

Start with a reproducible interaction and name the cost: initial resources,
render work, local storage, provider overhead, or CLI time. These are different
measurements. Use a production build when assessing loading behavior:

```sh
pnpm build
pnpm exec next start --hostname 127.0.0.1 --port 4198
```

Inspect the browser Network and Performance panels. Record browser, viewport,
cache state, fixture, revision, and command with the result. Keep unknown
usage unknown and include routing attempts in integrated totals. Do not infer
provider savings from local JavaScript timing or serialized token proxies.

The body font is local and preloaded. The Arena memoizes settled-run lessons
and per-example history counts by their inputs; streaming status updates do
not need to derive them again when those inputs are unchanged. These choices
reduce avoidable work by construction, not a measured latency claim. Avoid
adding broad caches or memoization without identifying repeated work and its
invalidation inputs.

Check loading, empty, failed, cancelled, complete, and reopened states. Keep
errors actionable and visible after persistence. Verify keyboard focus, radio
selection, tab navigation, dialogs, reduced motion, and narrow viewports.
Automated browser coverage is not human VoiceOver or keyboard-only acceptance.

## Deliver a reviewable change

1. Inventory the branch, worktree, and unrelated edits. Work on a topic branch.
2. Keep one concern per PR. Dependency changes and contract semantics get their
   own rationale and verification.
3. Add a regression for a behavioral defect, then implement the smallest fix.
4. Update architecture when behavior changes, question versions when wording
   changes, and documentation when commands or user flows change.
5. Run verification, inspect the diff, and request code review. Report gaps.
6. Sign, push, and use the PR template. State which verdicts change, including
   “None.” Link run artifacts for measured claims.
7. Check terminal CI and review feedback for the exact head before squash
   merging. Verify the resulting main commit and signing afterward.

The repository is source-only and unpublished. A merged commit is not proof
of a deployment or live-provider acceptance. Keep security reports private
through [SECURITY.md](../SECURITY.md), and preserve license attribution for
vendored assets. Remote signing, push protection, and branch rules must be
verified separately from checked-in policy text.
