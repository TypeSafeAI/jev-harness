# ContextScorer cost model and go/no-go (roadmap phase 4)

Status: decision record for [issue #3](https://github.com/TypeSafeAI/jev-harness/issues/3).
No `ContextScorer` code exists in this repository, and this document does not
add any. It uses only recorded run artifacts and official public documentation.
No provider was called to write it.

## Decision

**No-go for ContextScorer integration code. Conditional go for a shadow
experiment on synthetic context only.**

- On the only recorded workload with provider token usage (the Codex CLI arena),
  there is essentially nothing to score: the fixture context is one 92-byte file
  inside a session of about 29.6k input tokens, which are mostly the CLI's own
  instructions and tool scaffolding. A scorer cannot save money there.
- For a hypothetical context block that already stays the same from turn to
  turn, scoring breaks even only when it drops at least about **84%** of that
  block at 10 turns per session, and about **93%** in the long-session limit
  (gpt-5.3-codex prices). That is exactly where a relevance error is most
  likely to remove something the proposer needed. This is a no-go.
- Scoring is cheap in money when the context block is **already reassembled
  every turn**, for example a fresh retrieval per turn, or a single-turn call.
  Then the break-even drop fraction is about 2–5%. It still adds one serial Jev
  round trip, measured at **206 ms p50 and 474 ms p95**, before the proposer
  can start.

The dominant term is not Jev's price. Jev input costs $0.042 per million
tokens, 2.4% of an uncached gpt-5.3-codex input token. The dominant term is the
cache discount you forfeit when the assembled context stops being a stable
prefix. Both providers checked bill cache reads at 0.1× the input rate.

## Sources

Every number below comes from one of these. "Checked" means fetched on
2026-09-22.

| Id | Source | What it supplies |
| --- | --- | --- |
| L | Playground live proposal-review runs at commit [`2c6cac9`](https://github.com/TypeSafeAI/typesafe-playground/tree/2c6cac903ee3887eb72548e012c14a7aefe4f3bd) (branch `feat/proposal-review`): [run 1](https://github.com/TypeSafeAI/typesafe-playground/blob/2c6cac903ee3887eb72548e012c14a7aefe4f3bd/docs/proposal-review-results.live.json), [r2](https://github.com/TypeSafeAI/typesafe-playground/blob/2c6cac903ee3887eb72548e012c14a7aefe4f3bd/docs/proposal-review-runs/live-2026-09-22-r2.json), [r3](https://github.com/TypeSafeAI/typesafe-playground/blob/2c6cac903ee3887eb72548e012c14a7aefe4f3bd/docs/proposal-review-runs/live-2026-09-22-r3.json), [r4](https://github.com/TypeSafeAI/typesafe-playground/blob/2c6cac903ee3887eb72548e012c14a7aefe4f3bd/docs/proposal-review-runs/live-2026-09-22-r4.json) | Jev `jev-1.13.0` wall-clock latency per request, one request per proposal carrying four `noul` questions |
| A | This repository at commit [`3b1704f`](https://github.com/TypeSafeAI/jev-harness/tree/3b1704f3c6a59fe9b121e0c158fc7466da3a1df8/docs/verification): [live-arena](https://github.com/TypeSafeAI/jev-harness/blob/3b1704f3c6a59fe9b121e0c158fc7466da3a1df8/docs/verification/live-arena-2026-09-22.json), [live-arena-parallel](https://github.com/TypeSafeAI/jev-harness/blob/3b1704f3c6a59fe9b121e0c158fc7466da3a1df8/docs/verification/live-arena-parallel-2026-09-22.json), [live-arena-mcp-only](https://github.com/TypeSafeAI/jev-harness/blob/3b1704f3c6a59fe9b121e0c158fc7466da3a1df8/docs/verification/live-arena-mcp-only-2026-09-22.json), [live-routing](https://github.com/TypeSafeAI/jev-harness/blob/3b1704f3c6a59fe9b121e0c158fc7466da3a1df8/docs/verification/live-routing-2026-09-22.json) | Codex CLI 0.155.1 session input, cached-input and output tokens; Jev routing request bytes, billed tokens and latency |
| TS | [TypeSafe Models](https://docs.typesafe.ai/models.md), checked 2026-09-22 | Jev 1.13 price $0.042 per Mtok, input tokens only, output free; 64k tokens per request, 32k for `state` plus the longest question; 250,000 tokens/s and 1,200 requests/min, "adjusting dynamically"; state ingested once, questions evaluated in parallel |
| TF | [TypeSafe speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md) and [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) (last reviewed 2026-09-17), checked 2026-09-22 | "adding more questions usually has little effect on response time"; "Accuracy falls as the state grows with content unrelated to the decision" |
| OP | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), checked 2026-09-22 | Standard tier per Mtok: gpt-5.3-codex $1.75 input / $0.175 cached / $14 output; gpt-5.6-terra $2.00 / $0.20 cached / $2.50 cache write; gpt-5.6-luna $0.20 / $0.02 cached |
| OC | [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), checked 2026-09-22 | "Cache reuse requires the entire rendered prefix to match"; GPT-5.6+: 1,024-token minimum, reads 0.1×, writes 1.25×, 30-minute reuse window; earlier models: cached tokens reported in 128-token steps, no write charge, in-memory entries typically 5–10 minutes idle |
| AP | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing.md), checked 2026-09-22 | Per Mtok base input / cache hit: Opus 5 $5 / $0.50; Sonnet 4.6 $3 / $0.30; Haiku 4.5 $1 / $0.10. 5-minute write 1.25×, 1-hour write 2×, read 0.1× |
| AC | [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md), checked 2026-09-22 | "Cache hits require 100% identical prompt segments"; changes at a level invalidate that level and all later levels |

One run is a signal, not a calibration. Every measured number here comes from
synthetic fixtures on one day.

## Measured inputs

### Jev latency (source L)

The four live runs contain 160 plus-Jev pipeline cases. Of those, 132 reached
Jev and returned answers, 33 per run. The rest were rejected by validation
before any call. None errored. The playground's headline "257 ms" is the mean
of run 1 alone. Pooled across all four runs:

| n | mean | p50 | p90 | p95 | p99 | min | max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 132 | 245 ms | 206 ms | 357 ms | 474 ms | 658 ms | 134 ms | 975 ms |

Per-run means were 257, 213, 281 and 229 ms. Percentiles use the nearest-rank
method. Each value is the client's wall-clock time for one round trip carrying
four questions, including the network. Request token counts for these review
payloads were not recorded. Latency at scoring-sized states (10–32k tokens,
tens to hundreds of questions) is **unmeasured**. The docs say added questions
usually add little time (TF), but nobody has measured the effect of state size.

If chunks are scored with parallel requests, the turn waits for the slowest
one. Resampling the 132 values with replacement (20,000 draws, assuming
independent requests of the same size) gives:

| parallel requests | p50 of slowest | p95 of slowest |
| ---: | ---: | ---: |
| 1 | 206 ms | 474 ms |
| 4 | 333 ms | 658 ms |
| 10 | 408 ms | 975 ms |
| 50 | 658 ms | 975 ms |

The 975 ms ceiling is simply the largest sample; the true tail is longer. This
resampling is arithmetic on recorded data, not a measurement of parallel calls.

### Jev billed tokens (source A)

Each arena run made one Jev routing request of 1,007 bytes, billed as 507 input
tokens (plus 54 output tokens, which are free), taking 409, 436 and 480 ms
through the local host. The manual routing smoke run reported 492 input tokens
and 0.43 s. That comes to **about 2.0 bytes per billed token** for a JSON
payload. The routing bench's `ceil(bytes / 4)` proxy would undercount this
payload by about half. Priced at TS, one such request costs $0.0000213.

### Proposer session tokens (source A)

Six Codex CLI lanes ran the same synthetic `read` task. Each made one tool call
and all completed.

| artifact | lane | input | cached | cached share | duration |
| --- | --- | ---: | ---: | ---: | ---: |
| live-arena | baseline | 29,817 | 21,760 | 73.0% | 18.0 s |
| live-arena | integrated | 29,322 | 17,280 | 58.9% | 13.6 s |
| live-arena-parallel | baseline | 29,800 | 17,152 | 57.6% | 16.4 s |
| live-arena-parallel | integrated | 29,329 | 21,504 | 73.3% | 19.2 s |
| live-arena-mcp-only | baseline | 29,856 | 21,760 | 72.9% | 12.4 s |
| live-arena-mcp-only | integrated | 29,373 | 26,752 | 91.1% | 15.2 s |

The mean cached share is 71.1% (range 57.6–91.1%). Every cached count is a
multiple of 128, which matches OC's reporting for pre-5.6 models. The arena
records "default model" and no model id, so **the proposer model is unknown**.
At gpt-5.3-codex prices (OP), a lane costs $0.0115–$0.0270, mean $0.0206. The
Jev request is about 0.1% of that. These lanes ran under a local CLI sign-in,
so the dollar figures are what API billing would have charged, not what was
actually paid.

**What this workload says about scoring:** the scorable context, meaning
fixture files and evidence, is one 92-byte file. The roughly 29.6k input
tokens are the CLI's own instructions, tool schemas and turn history. A
ContextScorer would not touch them. On this workload a scorer has almost
nothing to drop, so scoring has no measured benefit to weigh against its cost.

## Model

### Variables

| Symbol | Meaning | Value used | Source |
| --- | --- | --- | --- |
| `C` | chunks per turn | parameter | unknown |
| `k` | tokens per chunk | parameter | unknown |
| `K = C·k` | scorable context tokens per turn | 4k–32k illustrated | parameter; Jev caps one request at 32k state (TS) |
| `T` | proposer turns per session within cache lifetime | parameter | unknown; arena sessions ran 12–19 s, well inside every TTL (OC, AC) |
| `P` | proposer uncached input price per token | $1.75/Mtok (gpt-5.3-codex) and others | OP, AP |
| `r` | cached-read multiplier | 0.1 | OC (5.6+), AP; gpt-5.3-codex $0.175/$1.75 = 0.1 (OP) |
| `w` | cache-write multiplier | 1 (pre-5.6 OpenAI); 1.25 (GPT-5.6+, Anthropic 5 m) | OC, AP |
| `p_J` | Jev price per input token | $0.042/Mtok | TS |
| `ρ = p_J / P` | Jev token price relative to the proposer's | 0.024 at gpt-5.3-codex | derived |
| `ε` | Jev overhead per scored context token: questions, task, untrusted-data note, JSON | 0.1 (one fan-out request); 1.0 (one request per chunk, repeating the task) | parameter; see billed-token note above |
| `s` | share of the context block that would be a cache hit **without** scoring | 0–1 swept | unknown; this is what the shadow experiment must measure |
| `s'` | share of the **scored** context that stays a cache hit | 0 (conservative) | parameter |
| `d` | share of context tokens the scorer drops | swept | unknown |
| `X` | tokens placed after the context block that scoring would also invalidate | 0 if the scored block goes last | design choice (OC, AC: a change invalidates everything after it) |
| `L_J` | serial Jev latency per turn | 206 ms p50 / 474 ms p95 | L |
| `τ` | proposer prefill time per uncached token | parameter | not published in OC or AC; unmeasured |
| `e`, `$_turn` | probability that a dropped chunk forces an extra turn, and that turn's cost | parameter | unknown |

### Money per turn

Cost of the context block without scoring:

```text
baseline = P · K · (1 − s·(1 − r))
```

With scoring, Jev reads every chunk once, the proposer reads the kept share,
and anything after the block loses its cache:

```text
scored = p_J · K · (1 + ε) + P · (1 − d) · K · (1 − s'·(1 − r)) + P · X · (1 − r) + e · $_turn
```

With `s' = 0`, `X = 0` and `e = 0`, scoring saves money only when:

```text
d > d* = s · (1 − r) + ρ · (1 + ε)
```

Across a session where the block is fixed and the first turn fills the cache,
`s = (T − 1) / T`. With `r = 0.1`, the first term dominates. Jev's price shows
up only through `ρ`, which is small for every proposer checked except the
cheapest.

The model leaves out the cache-write premium `w` on the first baseline turn.
Including it helps scoring slightly when `T` is small, and not at all as `T`
grows.

### Break-even drop fraction `d*`

With `ε = 0.1`, meaning one fan-out request per turn:

| proposer (price source) | ρ | s = 0 | s = 0.25 | s = 0.5 | s = 0.75 | s = 0.9 | s = 1.0 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-5.6-luna (OP) | 0.2100 | 0.23 | 0.46 | 0.68 | 0.91 | never | never |
| Claude Haiku 4.5 (AP) | 0.0420 | 0.05 | 0.27 | 0.50 | 0.72 | 0.86 | 0.95 |
| gpt-5.3-codex (OP) | 0.0240 | 0.03 | 0.25 | 0.48 | 0.70 | 0.84 | 0.93 |
| gpt-5.6-terra (OP) | 0.0210 | 0.02 | 0.25 | 0.47 | 0.70 | 0.83 | 0.92 |
| Claude Sonnet 4.6 (AP) | 0.0140 | 0.02 | 0.24 | 0.47 | 0.69 | 0.83 | 0.92 |
| Claude Opus 5 (AP) | 0.0084 | 0.01 | 0.23 | 0.46 | 0.68 | 0.82 | 0.91 |

With `ε = 1.0`, meaning one request per chunk, each value rises by `ρ · 0.9`.
That is 0.02 for gpt-5.3-codex and 0.19 for gpt-5.6-luna. For a proposer as
cheap as gpt-5.6-luna, Jev reading a token costs more than luna reading it from
cache ($0.042 against $0.02 per Mtok), so scoring a stable context never pays.

Session length at gpt-5.3-codex, fixed block, `ε = 0.1`:

| T | 1 | 2 | 5 | 10 | 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `s` | 0 | 0.5 | 0.8 | 0.9 | 0.95 |
| `d*` | 0.03 | 0.48 | 0.75 | 0.84 | 0.88 |

### Dollar scale

Net saving per 1,000 turns for a 16k-token context block at gpt-5.3-codex,
`ε = 0.1`, `s' = 0`, `X = 0`, `e = 0`. Positive means scoring is cheaper.

| s | baseline | d = 0.25 | d = 0.5 | d = 0.75 | d = 0.9 | d = 0.95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | $28.00 | +$6.26 | +$13.26 | +$20.26 | +$24.46 | +$25.86 |
| 0.5 | $15.40 | −$6.34 | +$0.66 | +$7.66 | +$11.86 | +$13.26 |
| 0.9 | $5.32 | −$16.42 | −$9.42 | −$2.42 | +$1.78 | +$3.18 |
| 1.0 | $2.80 | −$18.94 | −$11.94 | −$4.94 | −$0.74 | +$0.66 |

Jev's share is $0.74 per 1,000 turns in every cell. Once the context is
cached, the largest possible saving is the baseline column itself, a few
dollars per thousand turns. If a dropped chunk forces the proposer to redo
work costing one arena-sized session ($0.0206, source A), that costs $20.60
per 1,000 affected turns. An error rate `e` of 3% cancels the +$0.66 cell at
`s = 1.0, d = 0.95`; 15% cancels the +$3.18 cell at `s = 0.9, d = 0.95`.

### Latency per turn

Scoring puts `L_J` in front of every proposer call unless the host overlaps
it with other work. The proposer's prefill time changes by about
`τ · K · [(1 − d)·(1 − s') − (1 − s)]`, ignoring the smaller cost of reading
cached tokens. Scoring reduces latency only when:

```text
τ · K · (d − s)  >  L_J        (with s' = 0)
```

- With a stable block (`s ≥ d`), the left side is zero or negative. Scoring
  makes the turn slower. This is a no-go.
- With an unstable block (`s = 0`), you need `d · K > L_J / τ`. Neither
  provider publishes `τ` in the pages checked, so this stays a parameter. If
  `τ` were 0.02 ms per token, a hypothetical value, a 206 ms p50 would require
  dropping more than 10k tokens per turn just to break even on latency.

For scale, one p50 Jev round trip is 1.1–1.7% of a recorded 12–19 s Codex
session (A). But a scorer runs once per model call, not once per session.

## Conditions for go

A later integration decision may say go only if a shadow experiment shows all
of the following on synthetic or consented context:

1. **The context is already unstable.** The measured `s` for the context block
   without scoring is low enough that the observed `d` exceeds `d*` from the
   table, with margin. As rough guidance at gpt-5.3-codex prices: `s ≤ 0.25`
   with `d ≥ 0.5`, or single-turn calls.
2. **Placement preserves the prefix.** The scored block sits after the static
   prefix and after turn history (`X = 0`). A layout that puts scored context
   before history multiplies the forfeited cache by the history length.
3. **Recall holds at that drop rate.** Independently labeled relevant chunks
   are kept at a rate where `e · $_turn` does not cancel the saving.
4. **Latency is paid for or hidden.** Either `τ · K · (d − s) > L_J` is shown
   with a measured `τ`, or the host overlaps scoring with other work and the
   p95 Jev latency at the real state size is acceptable.
5. **The request fits Jev's limits.** `K` plus the longest question fits in
   32k tokens per request (TS), or the scorer splits requests and pays the
   parallel-tail latency above. Rate limits: 1,200 requests/min means 50
   chunk-per-request calls per turn uses up the whole budget within 24 turns
   per minute.
6. **The proposer isn't cheaper than Jev from cache.** For a proposer whose
   cached-input price is below $0.042/Mtok, such as gpt-5.6-luna, scoring a
   stable context never pays.

## Data egress

Scoring sends **every chunk** to Jev, including the ones it drops. Under the
repository's rules, only synthetic or explicitly consented context may be
scored until a reviewed data-egress policy exists. No real repository content,
private memory, identity material or credentials may be used. TypeSafe states
that Jev is not trained on customer requests, and offers zero data retention
to enterprise customers (TS). That is a provider statement, not an egress
policy. Chunk text is untrusted data. Every scoring payload must carry the
fixed untrusted-data note.

TF also warns that accuracy falls as irrelevant detail grows in the state.
Packing all chunks into one state is cheapest (`ε` small) but is exactly that
failure shape. One request per chunk avoids it and costs more. The shadow
experiment should measure both layouts.

## What would change the decision

- A measured workload where the context block is reassembled every turn
  anyway (low `s`). Then the money case is already open, and the question
  becomes recall and latency.
- A proposer or provider whose cached-read multiplier is well above 0.1, or
  that does not cache at all. That lowers `d*` directly.
- Measured Jev latency at 10–32k-token states that stays near the 206 ms p50
  measured on small payloads, together with a published or measured `τ`.
- A change in Jev pricing or limits (TS says the limits are adjusting). At
  current prices `ρ` adds about 0.03 to `d*` at gpt-5.3-codex; at 10× the Jev
  price it would add about 0.26, enough to make a fully cached block
  unprofitable at any drop fraction.
- Evidence that the scorer's value is quality rather than cost, for example
  fewer distractor-driven errors. That is a different claim and needs its own
  labeled evaluation. This model does not assume it.

## Next measurement: shadow experiment

Run the scorer beside, not inside, an unmodified proposer on synthetic
multi-turn sessions whose tasks draw on a context block of many chunks. The
current arena fixtures are too small to be useful.

Record per turn:

- `C`, `k` and `K`
- the baseline proposer's input tokens, `cached_tokens` and cache-write tokens, which gives the real `s`
- Jev `usage.input_tokens`, wall-clock latency, and state size for both the fan-out and the per-chunk layout
- the drop set at a frozen threshold, and so the would-be `d`
- recall against independently labeled relevant chunks

Compute the counterfactual cost with the formulas above. Do not change the
proposer's context during the shadow run. Only if the conditions for go hold
should a paired live comparison follow, with repeated trials and the
[evaluation plan](hardening/09-evaluation.md)'s accounting. Link every run
artifact at a commit SHA. One run is a signal, not a calibration.

## Reproducing the latency figures

From a checkout of `TypeSafeAI/typesafe-playground` that contains commit
`2c6cac9` (no checkout of that commit is needed):

```sh
for f in docs/proposal-review-results.live.json docs/proposal-review-runs/live-2026-09-22-r{2,3,4}.json; do
  git show 2c6cac903ee3887eb72548e012c14a7aefe4f3bd:$f
done | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const docs=s.split(/\n(?=\{)/).map(t=>JSON.parse(t));
  const v=docs.flatMap(d=>d.receipts.filter(r=>r.jev&&r.jev.answers).map(r=>r.jev.latencyMs)).sort((a,b)=>a-b);
  const q=p=>v[Math.ceil(p*v.length)-1];
  console.log({n:v.length,mean:v.reduce((a,b)=>a+b,0)/v.length,p50:q(0.5),p95:q(0.95),max:v[v.length-1]});
});'
```
