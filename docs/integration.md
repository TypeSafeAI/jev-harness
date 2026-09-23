# Add Jev to an existing coding harness

Keep the host's runtime, model and tool executor. Add a routing boundary where the host decides which tool schemas to put in model context. Start with an explicit shadow experiment; evaluate quality and overhead before exposing only selected tools.

In the Arena, open **Integrate → Get integration prompt**. Choose **Observe first** or **Pilot selected tools**, then copy the brief into your coding agent in the repository that owns your harness. The brief tells it to inspect the real host, pin this source, add the adapter and tests, record observations and document rollout. Download Markdown if clipboard access is unavailable. The brief contains no saved keys, answers or assessment notes. Its source is [`examples/integration/prompt.ts`](../examples/integration/prompt.ts).

This is independent community source, not an official TypeSafe SDK or a published package. Pin a reviewed Git commit and record its SHA when vendoring or adding a workspace dependency. Do not install an invented package name. The source requires the pinned pnpm toolchain and Node 22+.

## Run the adapter example first

```sh
pnpm install --frozen-lockfile
pnpm exec tsx examples/integration/host.ts
pnpm typecheck
pnpm test
pnpm check:secrets
```

The [working example](../examples/integration/host.ts) imports the public API and injects synthetic evidence. It records full/selected contexts, load/eviction and all routing outcomes without calling a model, executing a tool or measuring live performance. Its numbers are not a benchmark. Run it before adding host transport.

## Integrate at the tool-context boundary

```ts
import {
  createCatalog, prepareToolContext,
  type PrepareToolContextOptions,
} from "./vendor/jev-harness/src/index.js";

// The host supplies these options from its current turn and configuration.
export async function prepareHostTurn(options: PrepareToolContextOptions) {
  const catalog = createCatalog(options.catalog);
  const prepared = await prepareToolContext({ ...options, catalog });
  // Return evidence to the host. No execution or permission is implied.
  return prepared;
}
```

Adapt the import to the pinned source location. `prepareToolContext` takes `catalog`, `input: { intent, availableIds }`, `policy`, an injected `router`, explicit `mode: "shadow" | "lean"`, and optional `previous` context state and `signal`. It makes at most one routing request through `routeTools` and returns:

| Field | Use |
| --- | --- |
| `mode` | The host's explicit experiment stage |
| `receipt` | Routing outcome, normalized evidence, policy and exact snapshot |
| `full`, `lean` | Comparison contexts, calculated from the same previous state |
| `context` | The context for this handoff; consume this field rather than selecting a comparison snapshot yourself |

Shadow retains the host-available menu and records Jev's selection even when routing does not select a tool. This is an explicit experiment, not an outage fallback; its extra request can increase cost. Lean exposes selected schemas only. `needs_clarification`, `no_match` and `unavailable` produce an empty lean context. Handle each outcome explicitly in the host. No automatic retry or full-menu substitution is provided.

Cancellation observed before return makes the active `context` empty in either mode. A receipt and comparison snapshots may retain evidence that completed immediately before cancellation. Check the host's current turn/config generation after awaiting and discard stale handoffs. Re-route when task, availability, catalog or policy changes; do not reuse an old decision as a permission cache. Pass `context.state` as the next `previous` state only when your host actually adopts that context. Stable catalog order preserves stable schema ordering; it does not guarantee model prefix-cache reuse.

## What the host must own

- **Registry and validation.** Descriptors have no handlers. The current catalog supports a limited closed-object schema vocabulary; keep richer native argument validation in the host and explicitly adapt unsupported schemas. Never silently discard constraints. Keep descriptions short and distinct; relative cost units are not money.
- **Provider transport.** Implement `ToolRouter.review` server-side, with deadline and cancellation. `RoutingRequest` is a normalized seam, not the wire payload. Follow the [official Choice contract](https://docs.typesafe.ai/primitives/choice) and preserve the pinned model, clarification option and untrusted-data note. Validate the actual returned model and complete option distribution; do not manufacture missing probabilities.
- **Egress and credentials.** Send only data allowed by the host's reviewed egress policy. Keep keys out of descriptors, model context, receipts, observations and logs. The Arena's personal browser override is a local demo convenience, not a production credential architecture.
- **Dispatch.** Validate every proposed argument, recheck current grants and paths, enforce the sandbox and mediate alternate tools independently of routing. A selected descriptor does not grant permission. This package never applies proposals.
- **Persistence.** Store minimal redacted observations durably, handle write failures, retain setup versions and distinguish unknown outcomes before retrying. A digest or local cache is not authenticated provenance.

The four-question proposal-review decision table is a separate boundary. This guide uses the implemented router, not the pending proposal validator/runner extraction or planned context scorer. Follow [host conformance](hardening/08-host-conformance.md) before any real gated deployment.

## Track improvement as experiments

Use a frozen task set with independently labeled required capabilities and answer-quality criteria. Keep development/tuning tasks separate from held-out evaluation. Compare the same task and setup across repeated trials, recording order and cache conditions; alternate or randomize order so warmup is not consistently assigned to one treatment. The Arena runs its two lanes concurrently, so resource contention can affect timing.

| Record | Required context |
| --- | --- |
| Identity | Unique run/trial ID, task/dataset revision, host commit, actual CLI/Jev model, catalog/policy/prompt revision, baseline/shadow/lean mode |
| Routing | Outcome, selected and exposed IDs, normalized receipt, attempts and retries, failures and cancellations |
| Usage | CLI and Jev input/output/cache tokens and latency, concurrent wall time separately; missing values as `null` |
| Quality | Required tool coverage, returned/rejected calls, independent tests or human assessments with provenance and evidence links |
| Decision | Hypothesis, one changed variable, candidate revision, evaluation results, tradeoffs and keep/revert decision |

Baseline makes no Jev call. Shadow evaluates selections while preserving the host menu. Compare baseline with a bounded lean pilot only after tool coverage and quality meet predeclared criteria. Report all failures, clarification outcomes and review coverage, even when presenting a metric subset. Compare distributions and matched-run differences; do not combine changed setups into one trend or use a single fastest run as evidence of improvement. Count routing overhead and all attempts. Report money only when measured pricing and usage support it, not from schema bytes alone.

Keep an experiment log in the host repository, for example:

```markdown
## Hypothesis
Overlapping read/search descriptions expose unnecessary schemas.

## Candidate and control
Record the baseline and candidate commit, catalog, policy and prompt revisions.
Change only the overlapping descriptions; keep required tools and host grants.

## Evaluation
Link frozen tasks and repeated paired observations, including failed attempts.
Record required-tool coverage and independent quality evidence for both arms.
Compare total CLI + Jev usage, cache reuse and latency with unknowns explicit.

## Decision
Record keep or revert, quality/performance tradeoffs and remaining uncertainty.
```

If an agent used less input but did not inspect required evidence, repair that before optimizing tokens. If routing overhead exceeds CLI savings, test a representative larger catalog and review duplicate descriptor wording. If an unused tool appears in one trace, check repeated labeled tasks before removing it. Keep schema, policy and permission checks intact. These are experiments, not guaranteed optimizations.

## Use the Arena as a local notebook

After a simulation, open **Check the answers before comparing performance**, mark each lane **Meets task**, **Needs work** or **Not reviewed**, and write a bounded next-experiment note. These human annotations are separate from immutable receipts and never sent to Jev. Failed or absent lanes cannot be marked Meets task through the UI. Assessment storage failures stay visible; unreadable assessment data requires an explicit clear. Cross-tab changes preserve unsaved drafts. Saves compare the expected content inside the storage lock and reject stale queued edits; reload the newer assessment before editing again. Browsers without Web Locks cannot guarantee atomic overlapping writes.

**History** shows paired review coverage and can chart only pairs you marked Meets task, while keeping every saved run listed. Charts still require complete measurements and matching task/setup. Human annotations do not establish correctness, and filtering them is not a benchmark. **Lessons learned → Adapt this in your harness** opens the integration workflow. Downloads include the original evidence, derived lessons and the separate human assessment when one exists.

The browser cache retains up to 30 runs within 2 MB; annotations are separately bounded to 30 entries and pruned to current history IDs whenever an assessment is saved. Export evidence before clearing or exceeding retention. Clearing history also clears assessments, preserving Usage and the key override. Use your host's protected store for a lasting evaluation history; the Arena does not import arbitrary production runs or execute the copied prompt.

## Rollout and rollback

Ship the adapter behind an explicit host mode flag. Test malformed/out-of-set evidence, outage, empty availability, every routing outcome, abort, late results, changed grants and argument validation with fake transports. Verify that all alternate dispatch paths enforce the same host policy. Start with synthetic or explicitly consented shadow observations, evaluate a bounded lean pilot, then widen only when the predeclared quality and overhead criteria hold. Keep a deliberate baseline configuration as rollback; never silently change mode after provider failure. Record each change in setup identity and its linked evidence.

The [UI review](verification/harness-integration-ui-audit-2026-09-22.md) and [verification record](verification/harness-integration-2026-09-22.json) cover this adoption workflow with offline and synthetic browser evidence.
