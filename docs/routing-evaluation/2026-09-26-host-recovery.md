# Bounded recovery for invalid routing probability totals

Bounded recovery retries a routing response only when its probability total is
invalid. Both routing-only batches and the full CLI comparison match all
57 expected outcomes each. All 171 first responses were valid, so these runs
show no observed recovery benefit. All 39 assessable Jev-routed outputs meet the
unchanged blinded rubric; 18 expected clarification holds have no authored output
to assess. The preceding
[v5 full comparison](2026-09-26-routing-v5.md) retained one sum-invalid response
as unavailable. This change tests recovery in the optional host without changing
the pure evidence contract.

You can enable the same bounded policy in an explicit live comparison:

```sh
pnpm experiment:routing --live --sum-recovery --model gpt-6-sol --runs 3 --with-prerequisites --out recovery.json
```

This command consumes provider credits and requires `TYPESAFE_API_KEY` in the
environment and Codex authentication. To inspect a saved run without a provider call, use
`pnpm experiment:routing --table recovery.json`.

## Frozen change

The signed candidate is
[`9c5490be2a4777a10fb93a42a55bed078e3f4f52`](https://github.com/TypeSafeAI/jev-harness/commit/9c5490be2a4777a10fb93a42a55bed078e3f4f52).
The demo selects `probability_sum_only_v1` and Arena setup 7. The reusable
adapter defaults to `none`; the experiment CLI requires `--live --sum-recovery`.

Only a complete, pinned-model response whose probability sum is its sole
structural defect permits another identical request. The cap is three total
physical requests under one 45-second deadline. Any valid answer stops recovery,
including clarification, low confidence, ties, or a tool that disagrees with the
evaluation label. HTTP, transport, body, model, and other shape failures stop it.
Exhaustion stays unavailable; no probabilities are normalized.

Pure routing and proposal-review source, model, thresholds, task text, labels,
mocks, catalog, prerequisites, fixture handlers, and CLI isolation remain
unchanged. The host records each dispatched request and a sanitized numeric
projection, plus usage, response status, duration, and structural diagnostics.
Unknown totals remain unknown while reported subtotals stay available. The UI
shows one logical call separately from physical requests, including partial
ledgers when a stream ends before final telemetry arrives.

## Protocol and offline verification

The [predeclared plan](runs/2026-09-26-recovery-live-plan.json) fixes two
57-case routing-only batches followed, if supported, by 57 paired CLI cases.
Each batch repeats the same 19 task/catalog combinations three times. Every
case remains in the denominator; every attempt and its usage are retained. Terminal account or
rate errors stop the batch; selective failed-case reruns are excluded.

The [routing runner](runs/2026-09-26-recovery-diagnostic-original.mts) and
[full wrapper](runs/2026-09-26-recovery-package-original.mts) retain their
original temporary paths as provenance. Both verify frozen source and runner
bytes before and after work. The full wrapper also pins every file in the Codex
0.156.1 package, requests `gpt-6-sol` with medium reasoning, and preserves the
existing auth-only temporary homes, read-only sandbox, and disabled external
tools. Neither wrapper executes proposed source.

The [frozen-source gates](runs/2026-09-26-recovery-frozen-source-gates.json)
record 293 passing offline tests, typecheck, production build, secret scans,
independent specification and quality reviews, and
[29 intercepted browser checks](runs/2026-09-26-recovery-browser-result.json)
across 320–1920px. [CI for the frozen source](https://github.com/TypeSafeAI/jev-harness/actions/runs/36230931572)
also passes. [Desktop](runs/2026-09-26-recovery-ui-1440.png) and
[mobile](runs/2026-09-26-recovery-ui-390.png) screenshots were inspected; human
keyboard-only and VoiceOver acceptance were not performed.

The [real-main preflight](runs/2026-09-26-recovery-real-main-preflight-result.json)
uses fake fetch and an absolute fake CLI executable. Its
[fake artifact](runs/2026-09-26-recovery-real-main-fake-artifact.json) is explicitly
offline test data; `source: live` denotes the exercised code path. It checks all
114 rows, 57 logical calls, 114 physical fake requests, missing-metric accounting,
and exact artifact/table replay. It makes no task-quality claim.
[Wrapper fault probes](runs/2026-09-26-recovery-wrapper-verification.json)
cover cancellation, integrity failure, request bounds, and retained telemetry.
The separate [routing preflight audit](runs/2026-09-26-recovery-offline-audit.json)
deliberately includes wrong-model, low-confidence, recovered, and exhausted fake
responses. Those scripted outcomes are test coverage, not live benchmark scores.

## Live routing-only results

| Batch | First response / final expected outcomes | Selected | Clarification | Physical requests | Input / output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Initial](runs/2026-09-26-recovery-initial.json) | 57/57 · 57/57 | 39 | 18 | 57 | 45,741 / 7,185 |
| [Frozen repeat](runs/2026-09-26-recovery-repeat.json) | 57/57 · 57/57 | 39 | 18 | 57 | 45,741 / 7,185 |

Provenance: [initial](runs/2026-09-26-recovery-initial-provenance.json),
[repeat](runs/2026-09-26-recovery-repeat-provenance.json).
Independent audits: [initial](runs/2026-09-26-recovery-initial-audit.json),
[repeat](runs/2026-09-26-recovery-repeat-audit.json).
Every first response was structurally valid. Neither batch invoked a second
request, so these results establish no observed recovery benefit. They preserve
the expected v5 routing behavior with the recovery configuration enabled.

Both audits replay every numeric response through the unchanged pure routing
policy, reconcile all physical dispatches and token totals, and verify all 128
scoped source files against the frozen commit. There is no missing reported
input or output usage. Routing-only results do not assess a delivered answer.

## Full CLI comparison and blinded assessment

The [full batch](../../examples/routing/runs/2026-09-26-recovery-full.json)
contains 57 fixed pairs and 114 arm observations. Its
[provenance](../../examples/routing/runs/2026-09-26-recovery-full-provenance.json),
[completion record](../../examples/routing/runs/2026-09-26-recovery-full-completion.json),
and [independent audit](runs/2026-09-26-recovery-full-audit.json) verify 117 scoped
source files, all 42 pinned CLI package files, every dispatch, and every routing
and prerequisite decision. The requested proposer settings are not
provider-attested model metadata.

| Measure | All tools | Jev-routed |
| --- | ---: | ---: |
| Arm observations | 57 | 57 |
| Completed proposer turns | 57 | 39 |
| Expected routing disposition / returned tool | 30/57 | 57/57 |
| Expected routing clarification holds | 0 | 18 |
| Unavailable routes | 0 | 0 |
| Jev logical calls / physical requests | 0 / 0 | 57 / 57 |
| Additional requests / exhausted recovery | 0 / 0 | 0 / 0 |

The 30/57 baseline value is the legacy tool/clarification metric, not an
answer-quality grade. Every dispatched proposer turn completed: 96 total.
All 126 recorded tool calls returned, with no truncated traces. The routed arm
has 39 tool results and 18 expected routing holds; those holds stay in the full
denominator and do not supply an authored clarifying question.

All 57 Jev responses were valid on the first attempt, with 45,741 reported
input tokens and 7,185 output tokens and no missing usage. No extra request was
dispatched. The preceding v5 full run was 56/57 with one unavailable response;
this run was 57/57, but that difference cannot be attributed to recovery because
recovery never ran. The integrated code preserved the expected behavior on all
171 measured cases across the three batches.

### Blinded output assessment

A fresh agent assessed all 114 anonymized rows under
[the unchanged rubric v2](2026-09-25-output-rubric.md), without arm labels,
routing outcomes, or usage. Identical rows were graded once and expanded back to
all case IDs. The [frozen annotations](runs/2026-09-26-blind-I-assessments.json)
were joined only after the [exact-reference audit](runs/2026-09-26-blind-I-assessment-audit.json)
passed for every row. This is agent code reading, not validated human gold.

| Content grade | All tools | Jev-routed |
| --- | ---: | ---: |
| Meets rubric | 56 | 39 |
| Partial | 1 | 0 |
| Fails | 0 | 0 |
| Unassessable | 0 | 18 |
| Observed constraint violations | 0 | 0 |

The [joined assessment](runs/2026-09-26-routing-quality-I.json) retains every
case and its exact evidence. The baseline partial case asks which helper to
clean up but does not ask what cleanup or outcome is intended. The 18 routed
holds have no retained authored question; correct routing abstention does not
establish question quality. All 39 delivered Jev-routed clear-task outputs meet
the rubric. Pending patches and test source remain unexecuted proposals.

For the 39 matched pairs where both outputs meet the rubric and a source-access
call returned, reported mean usage is:

| Tokens per matched pair | All tools | Jev-routed, including Jev |
| --- | ---: | ---: |
| Input | 36,264 | 34,860 |
| Output | 323 | 456 |
| Cached input, proposer only | 30,635 | 29,739 |

All three metrics are known for all 39 pairs. Exact accessed source and a Jev
cache count are not retained. These means exclude the 18 non-equivalent
clarification pairs; their outcomes and costs remain in the full artifact.
Lower input accompanies higher output here, so these counts alone do not
establish a dollar saving or an execution-speed improvement.

The original excerpt checker did not support the assessor's explicit array
indices. The [v2 checker](runs/2026-09-26-audit-blind-assessments-v2.py) adds numeric
dot/bracket indices while retaining implicit array traversal. No grades changed.
Its [33 fault probes](runs/2026-09-26-blind-assessment-audit-v2-probe-results.json)
and [previous-batch regression audit](runs/2026-09-26-blind-H-assessment-audit-v2-regression.json)
pass; both batches match all 114 references.

The fixed-suite routing and output-quality gates support retaining the measured
demo default. They do not demonstrate that retries improved any live outcome:
none occurred. The unchanged proposal-review suite separately retains 200/200
expected verdicts in its linked report below.

### Offline reproduction

`pnpm exec tsx --test tests/routing-evidence-replay.test.ts` regenerates exact
blinded rows and mappings for batches A–I from a relocated checkout and replays
the retained recovery artifact with its physical dispatch ledger. You can also
render the table without a provider call:

```sh
pnpm experiment:routing --table examples/routing/runs/2026-09-26-recovery-full.json
```

To check the frozen annotation hashes and exact cited excerpts from any checkout,
use a fresh output path:

```sh
python3 docs/routing-evaluation/runs/2026-09-26-audit-blind-assessments-v2.py \
  docs/routing-evaluation/runs/2026-09-26-blind-I \
  /tmp/jev-blind-I-audit-fresh.json docs/routing-evaluation/2026-09-25-output-rubric.md
```

Original temporary paths in provenance are retained as recorded. Replaying the
artifact checks integrity and interpretation; it does not re-grade the output.

## Limits

These tasks influenced development. Repetition measures variation on this fixed
suite, not unseen-task coverage or calibration. Recovery cannot guarantee a
valid next response and can add provider work and latency. CLI-internal provider
attempts are not retained. Token counts do not establish monetary savings, and
shared-host measurements do not isolate execution speed.

Proposal review is unchanged and retains its separately measured
[200/200 expected verdicts](../calibration/2026-09-25-question-set-v4.md).
