# Routing distribution diagnostic and bounded recovery

The missing probability mass arrives in Jev's response. A fixed single-attempt
batch produced four complete, closed-set distributions summing to approximately
0.99. The unchanged validator returned `unavailable` for each. This locates the
failure at the provider response boundary; it does not identify the provider's
internal cause. The [official Choice contract](https://docs.typesafe.ai/primitives/choice)
specifies that the full probability distribution sums to one.

A maximum of three attempts recovered all cases in the first batch, but one
case exhausted the cap in the frozen repeat. Recovery is not integrated into
the example host. More requests increase measured usage, and these results do
not establish benchmark saturation or a general recovery rate.

## Frozen protocol

Source: [`dee6b572219482c104e9a16b06454caf7bd3739e`](https://github.com/TypeSafeAI/jev-harness/commit/dee6b572219482c104e9a16b06454caf7bd3739e),
routing question set 4, `jev-1.13.0`, unchanged policy and catalog. Each batch
contains the existing 19 task/catalog combinations repeated three times. No
CLI or proposed source executes. Labels are joined only after provider work.

The [v3 diagnostic runner](runs/2026-09-26-distribution-diagnostic-v3.mts)
retains only expected numeric probability fields, a known option id, shape flags,
and the SHA-256 of decoded response text. Unknown keys/strings, headers, keys,
raw provider text and exceptions are excluded. Each attempt retains its
unaltered receipt, request body, HTTP status and measurement. Source and runner
hashes are checked before and after work; all funded batches passed these checks.

Recovery is predeclared and limited to an unavailable receipt whose model,
answer type, confidence range, closed option set and leading choice all pass,
with only the distribution sum outside `1 ± 0.000001`. Requests remain
byte-identical. Every valid response stops recovery, including clarification
and low confidence. Every other failure stops that case; cancellation stops
the run. The cap is three attempts per case. HTTP 401/402/403/429 stops the
whole v3 batch. No probability is adjusted and no invalid response is accepted.

## Results

Expected outcome agreement includes correct clarification as well as acceptable
tool selection. It is not delivered-answer quality. All clear-task selections
in these batches match the fixed acceptable-tool labels.

| Batch | Expected final outcome | Selected | Clarification | Unavailable | Physical requests | Provider input / output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Single](runs/2026-09-26-distribution-wire-funded-single.json) | 53/57 | 39 | 14 | 4 | 57 | 44,430 / 7,185 |
| [Recovery](runs/2026-09-26-distribution-wire-funded-recovery.json) | 57/57 | 39 | 18 | 0 | 62 | 49,460 / 8,220 |
| [Recovery repeat](runs/2026-09-26-distribution-wire-funded-recovery-repeat.json) | 56/57 | 39 | 17 | 1 | 63 | 50,466 / 8,427 |

Provenance: [single](runs/2026-09-26-distribution-wire-funded-single-provenance.json),
[recovery](runs/2026-09-26-distribution-wire-funded-recovery-provenance.json),
[repeat](runs/2026-09-26-distribution-wire-funded-recovery-repeat-provenance.json).
[Computed accounting](runs/2026-09-26-distribution-summary.json) retains first,
final and per-attempt outcomes separately. The first responses in both recovery
batches were 39 selections, 15 clarifications and three unavailable cases.

The single-attempt failures were `uncertain-large` in all three repetitions and
`uncertain-small` in repetition 3. Each had total numeric mass approximately
0.99 and clarification as the leading option. All six retried cases across the
two recovery batches were repetitions of `uncertain-large`. The first batch
used 2, 3 and 3 attempts; the repeat used 3, 3 and 3. Repetition 2 of the repeat
remained unavailable after three malformed responses.

The first recovery batch retained five malformed attempts: per-attempt usable
evidence was 57/62, distinct from 57/57 final-case availability. The repeat
retained seven malformed attempts: per-attempt usable evidence was 56/63,
distinct from 56/57 final-case availability. No valid answer was retried.

Retry-only overhead was 5,030 input tokens, 1,035 output tokens and 989.246 ms
of measured host request latency in the first batch; 6,036 input tokens,
1,242 output tokens and 1,462.759 ms in the repeat. These are additional-attempt
measurements within each batch, not a causal latency comparison with the
separate single-attempt batch. Dollar cost and delivered-answer latency remain
unmeasured.

## Earlier billing-blocked attempt

The [earlier artifact](runs/2026-09-26-distribution-wire-single.json) records
57 HTTP 402 responses, all unavailable, without any model answer or usage.
Its `complete` status means all planned dispatches finished, not that the
diagnostic succeeded. See its [provenance](runs/2026-09-26-distribution-wire-single-provenance.json)
and exact [v2 runner](runs/2026-09-26-distribution-diagnostic-v2.mts).
The v3 runner adds terminal-HTTP stopping, which was verified offline before
the funded runs. HTTP 402 does not distinguish account funding from a key's
budget limit. This attempt provides no routing-quality or provider-cost evidence.

## Reproduction and next experiment

Create an isolated checkout at the frozen source revision, use the pinned
pnpm version and `pnpm install --frozen-lockfile`, then invoke the archived v3
runner from that checkout. A funded `TYPESAFE_API_KEY` must be supplied through
the host's secure environment; never write it to a command or artifact.

```sh
pnpm exec tsx /absolute/path/to/2026-09-26-distribution-diagnostic-v3.mts --offline --attempts 3 --out /tmp/fresh-fake.json
pnpm exec tsx /absolute/path/to/2026-09-26-distribution-diagnostic-v3.mts --live --attempts 1 --out /tmp/fresh-single.json
pnpm exec tsx /absolute/path/to/2026-09-26-distribution-diagnostic-v3.mts --live --attempts 3 --out /tmp/fresh-recovery.json
```

Output and provenance paths must be fresh. Automated checks use only fakes.
The runner deliberately refuses a different source commit. Independent replay
of the funded numeric projections matched the unchanged routing receipts.

The next candidate changes only generic clarification wording: a named target
is not a specified outcome, and a vague improvement request does not supply a
concrete edit. It requires a new question-set version, fixed single-attempt
batches and an unchanged validation threshold. It is a hypothesis, not a
measured improvement. Repeated adaptive development cases are not held-out
calibration, and a successful routing result does not authorize execution.
