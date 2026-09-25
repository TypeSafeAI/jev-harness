# Routing optimization development ledger

Four matched routing comparisons and their blinded output assessments are
complete; further instruction measurements remain pending. This ledger retains setup
failures and cancelled runs alongside successful measurements; none are silently
dropped or counted as evidence of improved task completion. Proposal review is
reported separately in the [v4 development comparison](../calibration/2026-09-25-question-set-v4.md).

## Frozen comparison protocol

Each complete routing batch uses the existing synthetic tasks and frozen labels,
with three repetitions of each task and catalog size. The all-tools and routed
arms alternate order within each configuration. Selected roots remain distinct
from host-declared prerequisites. The pinned model, confidence floor, probability
floor, relevance window and per-tool cost policy remain unchanged.

The corrected comparisons use the complete Codex 0.156.1 native package,
requested proposer model `gpt-6-sol`, and medium reasoning effort. The
[package manifest](../../examples/routing/runs/2026-09-25-pinned-package-manifest.json)
records every copied file hash. A hash check runs before and after each batch;
`codex` resolves through the pinned package's `bin` directory so the host's
auth-only credential copy remains active. The CLI still receives an isolated
temporary home, fixed synthetic input, disabled external capabilities, and the
existing bounded fixture tools. No proposal is applied or executed.

Configurations overlap on one machine. Their latency is subject to shared
resources and provider variation, so this is not an isolated speed comparison.
Requested proposer settings are not provider-attested model metadata. Repeated
tasks are repeatability observations, not new coverage or held-out calibration.

## Retained setup failures

| Attempt | Retained evidence | Disposition |
| --- | --- | --- |
| Initial unpinned comparison | [114 arm observations](../../examples/routing/runs/2026-09-25-routing-baseline.json), [provenance](../../examples/routing/runs/2026-09-25-routing-baseline-provenance.json) | CLI installation changed from the initially observed 0.155.1 to 0.156.1. This run cannot establish a matched comparison with the candidate. |
| Initial prerequisite candidate | [Partial run](../../examples/routing/runs/2026-09-25-routing-prerequisites.json), [provenance](../../examples/routing/runs/2026-09-25-routing-prerequisites-provenance.json) | Cancelled after version drift was detected; all seven started arm observations are retained. |
| Binary-only pinned baseline | [Run](../../examples/routing/runs/2026-09-25-routing-pinned-baseline.json), [provenance](../../examples/routing/runs/2026-09-25-routing-pinned-baseline-provenance.json) | All 87 launched CLI processes failed. The wrapper passed an absolute executable path, selecting the fake-executable branch that intentionally skips authentication. |
| Binary-only pinned prerequisites | [Run](../../examples/routing/runs/2026-09-25-routing-pinned-prerequisites.json), [provenance](../../examples/routing/runs/2026-09-25-routing-pinned-prerequisites-provenance.json) | The same wrapper error caused all 87 launched CLI processes to fail. These failures are not routing-quality measurements. |
| Authentication restored, incomplete package | [Smoke](../../examples/routing/runs/2026-09-25-pinned-cli-auth-smoke.json), [diagnostic repeat](../../examples/routing/runs/2026-09-25-pinned-cli-diagnostic-smoke.json) | The CLI completed but reported that its tool host could not start. A completed CLI turn alone is insufficient preflight proof. |
| Complete native package | [Smoke](../../examples/routing/runs/2026-09-25-pinned-package-smoke.json) | The same CLI executable hash, with its companion files, completed and returned `read_file`. This satisfied preflight before replacement batches. |

The two binary-only batches each retain all 57 Jev routing calls, including
unavailable outcomes. Missing CLI usage stays unknown; no cost is inferred from
a failed process. The initial inspector secret-store startup also timed out
before the benchmark wrapper started; a separate manual launch began afterward.
The first fixture-handler launch also timed out at the secret store before any
provenance or benchmark artifact was written; its second launch is recorded
separately. Both v4 routing diagnostic launches had the same startup failure
before the wrapper ran. Neither created a provenance file or made a provider
request; further live diagnostics await credential-store access.
Provider requests are not automatically retried.

## Completed comparisons

Each row contains 57 paired cases (114 arm observations). The source manifests
match their recorded clean commits. The full artifacts pass their corresponding
version-pinned offline parsers and receipt replay. A/B were also checked with the
fixture-handler candidate parser; C was checked at `ed01e8d`, whose parser supports
question version 2. The parser at `b9bf81a` supports only version 1 and cannot read C. To reproduce, use
`pnpm experiment:routing --table <artifact-path>` at the corresponding source
commit. Counts below preserve every outcome.

| Configuration | Source and evidence | Routed legacy score | Returned acceptable tool or expected routed clarification | Routed patch calls returned | Routing unavailable |
| --- | --- | --- | --- | --- | --- |
| Selected root only | `e75b77a`; [run](../../examples/routing/runs/2026-09-25-routing-package-baseline.json), [provenance](../../examples/routing/runs/2026-09-25-routing-package-baseline-provenance.json) | 32/57 | 26/57 | 0/9 | 1/57 |
| Root plus prerequisites | `2eb8bcd`; [run](../../examples/routing/runs/2026-09-25-routing-package-prerequisites.json), [provenance](../../examples/routing/runs/2026-09-25-routing-package-prerequisites-provenance.json) | 46/57 | 34/57 | 9/9 | 2/57 |
| Prerequisites plus inspector v2 | `ed01e8d`; [run](../../examples/routing/runs/2026-09-25-routing-package-inspector-attempt2.json), [provenance](../../examples/routing/runs/2026-09-25-routing-package-inspector-attempt2-provenance.json) | 48/57 | 36/57 | 9/9 | 0/57 |
| Inspector v2 plus fixture handlers | `050df77`; [run](../../examples/routing/runs/2026-09-25-routing-package-fixture-tools-attempt2.json), [provenance](../../examples/routing/runs/2026-09-25-routing-package-fixture-tools-attempt2-provenance.json) | 46/57 | 46/57 | 7/9 | 2/57 |

These are operational measures, not final-answer scores. In the first three configurations,
the all-tools arm scores 30/57 under the legacy metric and 18/57 under the
returned-call measure. Its grounded reads before clarification and explanation
can be useful despite failing those labels; the supplementary output assessment
uses a [separately frozen rubric](2026-09-25-output-rubric.md).

Prerequisites restore read access before a patch proposal: the selected-only arm
made no patch calls in nine trials, while both prerequisite configurations
returned patch calls in all nine. This requires answer/proposal review before
calling the edits correct. Search and test-draft handlers are still absent in
these three frozen hosts: the twelve relevant routed trials in each prerequisite
configuration include rejected target-tool calls. Their legacy successes do not
establish delivery.

Inspector v2 does not fix the inspection failure. In all nine inspection trials,
Jev's leading choice is `inspect_agent`, but confidence ranges from 0.47 to 0.56,
below the unchanged 0.7 floor. All nine therefore withhold context. The v3
instruction diagnostic below tested whether explicitly treating source access
as a useful step resolved this capability ambiguity, keeping descriptions,
labels, model settings and policy thresholds fixed. It did not.

The three unavailable results in the first two configurations are malformed
probability distributions summing to approximately 0.99. They remain unavailable;
no normalization, weakened validation, or retry was used. The absence of that
failure in the third batch does not establish a provider-reliability improvement.

The fixture-handler candidate returns all six routed searches and all six
routed test-draft recordings; its all-tools arm also returns every requested
search and test-draft call. Its all-tools scores are 30/57 under both operational
measures. Two routed patch requests are unavailable before any proposer call;
all seven remaining patch requests return read and patch calls. All nine
inspection requests still withhold context. Its blinded answer assessment below
separately grades the retained source and findings.

The bounded fixture handlers were subsequently integrated into current main in
[PR #47](https://github.com/TypeSafeAI/jev-harness/pull/47), preserving main's
routing v1 and original inspector behavior. D measures the frozen `050df77`
candidate with experimental routing v2; it is not a live measurement of the
merged main revision. Inspector and instruction candidates remain separate
experiments, with v3 rejected and v4 still unmeasured.

## Reading the results

### Routing-only instruction diagnostic

A further diagnostic measures routing evidence without launching Codex or grading
answers. It uses the same 19 task/catalog combinations three times, keeps the
policy and labels fixed, and retains every request and receipt. Its root-selection
or clarification agreement is a different metric from the paired tool-call and
answer scores above.

| Instruction | Frozen source | Expected root or clarification | Unavailable | Evidence |
| --- | --- | --- | --- | --- |
| v2 | `ed01e8d` | 47/57 | 1/57 | [receipts](runs/2026-09-25-routing-evidence-v2.json), [provenance](runs/2026-09-25-routing-evidence-v2-provenance.json) |
| v3, source evidence as a useful step | `a12baee` | 36/57 | 3/57 | [receipts](runs/2026-09-25-routing-evidence-v3.json), [provenance](runs/2026-09-25-routing-evidence-v3-provenance.json) |

V3 is rejected for deployment. All nine patch requests and all nine inspection
requests fall below the fixed confidence floor. The three unavailable results
are test-draft distributions summing to approximately 0.99; they were not
normalized or retried. The patch distributions split mass between reading and
proposing. This is consistent with the new wording making a preliminary read
compete with the requested deliverable; it does not isolate the cause. The next
versioned hypothesis distinguishes the requested operation from its preliminary
read while retaining the source-inspection capability and clarification option.

The [original diagnostic wrapper](runs/2026-09-25-routing-evidence-runner-original.mts)
passed a task object instead of its id in its offline fake branch; its initial
[fake preflight](runs/2026-09-25-routing-evidence-diagnostic-fake.json) therefore
returned clarification for every case. That branch is not used by the live v2
run. The [corrected wrapper](runs/2026-09-25-routing-evidence-runner-corrected.mts)
changes only that fake argument; its [new fake preflight](runs/2026-09-25-routing-evidence-diagnostic-fake-corrected.json)
matches all 57 scripted labels. Live v3 uses the corrected wrapper. Both versions,
all preflights and their provenance remain retained; no live result is rewritten.

### Blinded output assessment

The frozen rubric was applied to blinded retained outputs before joining their
arms, routing evidence and usage. The reviewer saw each task and synthetic
source, the final answer, pending proposals and tool-status trace. Exact duplicate
inputs and outputs shared a judgment, expanded back to every case. The join
checks artifact/input hashes, unique case coverage and trial identities. This is
supplementary agent code reading, not validated human grading or executed tests.

| Configuration and arm | Meets | Partial | Fails | Unassessable | Assessment evidence |
| --- | --- | --- | --- | --- | --- |
| Selected-only, all tools | 53 | 3 | 1 | 0 | [A](runs/2026-09-25-routing-quality-A.json) |
| Selected-only, Jev | 11 | 21 | 0 | 25 | [A](runs/2026-09-25-routing-quality-A.json) |
| Prerequisites, all tools | 56 | 1 | 0 | 0 | [B](runs/2026-09-25-routing-quality-B.json) |
| Prerequisites, Jev | 24 | 6 | 0 | 27 | [B](runs/2026-09-25-routing-quality-B.json) |
| Inspector v2, all tools | 57 | 0 | 0 | 0 | [C](runs/2026-09-25-routing-quality-C.json) |
| Inspector v2, Jev | 24 | 6 | 0 | 27 | [C](runs/2026-09-25-routing-quality-C.json) |
| Fixture handlers, all tools | 57 | 0 | 0 | 0 | [D](runs/2026-09-25-routing-quality-D.json) |
| Fixture handlers, Jev | 28 | 0 | 0 | 29 | [D](runs/2026-09-25-routing-quality-D.json) |

Every row covers all 57 arm observations. Route-only clarification has no retained
answer to grade and stays unassessable, even when clarification is the correct
disposition. An unavailable route also remains operationally unavailable. The
sole failed answer in A proposes a behavior change before clarifying an ambiguous
cleanup request. In B and C, all nine routed patch outputs meet the rubric and
all six routed test drafts meet it through their final answers despite rejected
draft-tool attempts. All six routed searches remain partial, reporting their
missing handler without supplying findings. All-tools inspection answers meet
the rubric after ordinary reads despite failing the legacy inspector-only label.
In D, all six routed searches include all three requested lines and all six
retained test drafts correctly assert `NaN` for the unchanged empty-array case.
All seven available routed patch outputs meet the rubric. The remaining 29
observations retain no answer: two unavailable patch routes, nine held
inspections and eighteen appropriate clarification dispositions. None are
silently counted as successful answers.

Compare usage only where both outputs meet the content rubric, have a returned
source-access call, complete operationally and have no recorded constraint
violation. The [joined C assessment](runs/2026-09-25-routing-quality-C.json)
contains 24 such pairs: mean reported input is 38,991 for all tools and 37,307
for Jev including routing input; mean output is 406 versus 500 including routing
output. This is a different denominator from all 57 pairs. It is not a dollar
savings claim: cached input differs, and omitted answers cannot be counted as
equivalent work. Full per-case usage remains in the raw artifacts.

The `runs/` directory retains the blinded inputs, original annotations and
unblinding maps for A/B/C/D, along with the exact [original blinding script](runs/2026-09-25-jev-blind-routing-original.mts)
and [join script](runs/2026-09-25-jev-join-routing-assessments.py). The original
blinder and mappings record historical local paths. The [portable blinder](runs/2026-09-25-jev-blind-routing.mts)
changes only the task-module import to resolve within its own checkout; it
regenerates byte-identical blinded inputs and mappings with relocated artifact
paths. Content hashes and case ids remain unchanged.

Run the offline reproduction checks from any checkout:

```sh
pnpm exec tsx --test tests/routing-evidence-replay.test.ts
```

To reproduce a join, generate a fresh mapping that points to the local artifact,
copy the original annotations unchanged, then run the retained join script.
For example, using Python 3 for the historical join:

```sh
replay_dir=$(mktemp -d)
pnpm exec tsx docs/routing-evaluation/runs/2026-09-25-jev-blind-routing.mts \
  examples/routing/runs/2026-09-25-routing-package-baseline.json "$replay_dir/blind-A"
cp docs/routing-evaluation/runs/2026-09-25-blind-A-assessments.json "$replay_dir/blind-A-assessments.json"
python3 docs/routing-evaluation/runs/2026-09-25-jev-join-routing-assessments.py \
  "$replay_dir/blind-A" "$replay_dir/quality-A.json"
```

The regenerated join's artifact filename reflects the published filename; all
hashes, cases, grades, aggregates and paired usage match the retained report.
The archived originals and annotations are never overwritten. Reproduction
checks integrity and arithmetic; it does not repeat or validate the grading.

The legacy correct-tool score is retained unchanged. It counts an acceptable
tool id even if its handler rejects the call, and treats a no-tool answer as
clarification. It is therefore distinct from a returned tool call and from a
correct final answer. Search and test-draft descriptors originally had no
handlers; calling them could improve that score without supplying their result.

The frozen inspection label accepts `inspect_agent` only. A grounded explanation
after a cheaper `read_file` can still satisfy the task; that answer must be
assessed separately, without rewriting the frozen label. Any test draft must be
read against the supplied source: the frozen off-by-one loop makes `sum([])`
return `NaN`. Drafting an assertion that it returns zero does not describe the
current fixture. Proposed patches and tests remain unexecuted and unevaluated
by the fixture host.

Further instruction and confirmation measurements remain pending; routing
benchmark saturation has not been demonstrated. No total token saving or
production reliability claim is made from the setup attempts or incomplete tasks
above.
