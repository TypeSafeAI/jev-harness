# Routing evidence and dynamic tool context

The pure routing contract defines a host boundary. A host supplies a catalog and current availability, a routing adapter supplies evidence, and code selects descriptors to show to a proposer. The contract launches nothing. The separate example host can explicitly call live Jev and Codex against synthetic fixtures; proposed patches and code never execute.

## Review of the proposed direction

| Proposal | Implementation and boundary |
| --- | --- |
| Explicit state and structured actions | Validated catalog with a small closed-object JSON Schema subset. Existing `Proposal` and review verdicts are unchanged. |
| Dynamic tools and sub-agents | Availability is supplied per request. A sub-agent is a descriptor, with no launch capability. |
| Cost-aware routing | Probability floor and relevance window establish eligibility; estimated cost orders eligible tools, then probability and id break ties. |
| Load and compact context | Full mode includes all available schemas; lean mode includes selected schemas. Explicit load/eviction transitions permit reloading. No semantic compaction or context scoring. |
| Transparent chat UI | A separate synthetic browser host can display the same receipts, descriptors and context comparison. |
| Measure efficiency and speed | Record schema bytes, estimated tokens, acceptable-tool inclusion, cheapest acceptable selection and local comparison time. The [live experiment](routing-evaluation/2026-09-23.md) adds provider-reported usage and observed tool calls; answer quality, dollars and execution latency remain unmeasured. |

The original description assumed a loop and tool executor already existed. They do not, and adding them would cross this repository's evidence/authority boundary. Playground PR #41 is now merged; phase 1 extraction uses that canonical history. This independent routing experiment does not reconstruct that code.

## Contract

`createCatalog()` validates and snapshots descriptors. Ids are unique lowercase identifiers; `needs_clarification` is reserved. Each schema is a closed object with string, number or boolean properties, descriptions and declared required keys. This is a deliberately limited schema vocabulary, not an arbitrary JSON Schema validator or an argument validator. Unsupported schema keywords are rejected rather than silently removed. Catalogs cannot carry handlers through normalization.

A descriptor is the signature of a crystallized function, not the function. The logic behind an id is fixed ahead of time in host code, versioned there, and never sent to Jev or regenerated per call; the catalog carries only the id, kind, description and closed schema. What varies per request is therefore small: the routing adapter supplies evidence about *which* id fits, and a proposer later supplies *argument values*. That is the cost argument for routing, and it is also where the risk moves. A free-form string property is still untrusted text, so an instruction that no longer fits in a description can reappear in an argument. Prefer closed-set and typed properties where the host can offer them, treat every argument value as data to validate under the host's own policy, and remember that this package checks schema shape only. Selecting a descriptor is evidence that it fits the task; it grants no permission and launches nothing, and the byte proxies reported below do not measure what a live provider saves.

`routeTools(catalog, input, policy, router, signal?)` snapshots the catalog, input and policy before awaiting the host. The request contains the pinned model, routing question-set version, task, fixed untrusted-data note, available ids, kinds and short descriptions, plus a clarification option. Schemas, cost estimates, expected labels and mock weights are not in the request. The maximum catalog size leaves room for clarification within Jev's [choice limit](https://docs.typesafe.ai/primitives/choice).

The adapter returns a normalized `RoutingEvidence`: the pinned model, leading choice, confidence and a full probability distribution over exactly the options sent. Missing/unknown keys, non-finite/out-of-range values, a sum outside a small floating-point tolerance, a non-leading choice or a different model produce `unavailable`, with no selection. A tie including clarification asks for clarification. Choice confidence is supplied by the adapter; it is not `max(p, 1-p)` from the separate `noul` contract, nor correctness.

Policy applies in this order:

1. No available tools: no adapter call and `no_match`.
2. Cancellation, adapter failure or unusable evidence: `unavailable`, no selection. Raw adapter error strings are discarded.
3. Clarification leads or confidence falls below the configured floor: `needs_clarification`, no selection.
4. Retain tools above the probability floor, within `relevanceWindow` of the best available tool probability, and within `maxCostUnits` **per tool**.
5. Sort by ascending estimated cost, descending probability, then lexical id; return at most `topK`. No eligible candidate means `no_match`.

These are routing outcomes, not additions to `ReviewVerdict`. A `RoutingReceipt` is a separate schema that records the catalog snapshot, compact request, policy, normalized evidence, source, selection and reason. Its `execution.applied` is always `false`. Snapshots do not bind identity or authorize anything. Hosts must re-evaluate when their availability changes. Hosts also own a deadline and must pass cancellation to their transport; the pure package creates no timers.

`assembleContext(receipt, mode, previousState?)` serializes the task and actual tool schemas. It reports newly loaded and evicted ids. An evicted schema remains in the catalog and can be loaded again. This state is only schema inclusion, not a conversation, identity, cache, permission grant or semantic summary. Full mode includes available schemas even on a failed route because it represents the no-routing baseline; that never indicates permission to use them. Lean mode includes none after a failed route.

`prepareToolContext({ catalog, input, policy, router, mode, previous?, signal? })` composes one routing request with both context snapshots. Explicit `shadow` mode returns the full available menu as its active `context`; `lean` returns only selected schemas. Cancellation empties the active handoff in both modes, while comparison snapshots retain evidence. This helper does not implement transport, caching, a deadline, a session or authorization. See the [integration guide and runnable example](integration.md) for host freshness checks and a staged evaluation workflow.

## Host adapter and reuse

Reuse [`typesafe-router`'s routing engine](https://github.com/TypeSafeAI/typesafe-router/blob/main/lib/jevRouter.ts) on the host where appropriate. It currently lives in a Next.js source tree, imports application aliases, and has provider defaults and logging; importing that engine into the pure contract would bring host behavior with it. This package therefore owns only the normalization boundary and context-selection policy.

A host can map `RoutingRequest.intent` to `RouteRequest.userInput`, its options to router option ids/labels/descriptions, and the fixed untrusted-data note to the router context. Include the clarification option and configure clarification fallback. Preserve the pinned model in the host transport. Normalize the original choice evidence (or a validated `RouteDecision`'s `selectedOptionId`, `confidence`, and `allOptionScores`), not the fallback's replacement selection. Do not fabricate missing scores or turn a fallback into evidence. A host must check the actual returned model before labeling evidence with the pin.

The [official choice documentation](https://docs.typesafe.ai/primitives/choice) defines the provider request and response. `RoutingRequest` is a host seam, not that wire format. If constructing a Jev request directly, include the note in the fixed instruction and state, use the available options as `criteria`, and validate the response before normalization. No provider request is made here. Review wording/model pins remain unchanged; changes to routing instruction semantics bump `ROUTING_QUESTION_SET_VERSION` independently.

## Reproduce the synthetic comparison

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --silent bench:routing > routing-run.json
```

The output is the run artifact: command, timestamp, labels, paired contexts, metrics, local comparison duration and every routing receipt. Link that artifact whenever reporting numbers. An archived example from 2026-09-22 (`source: mock`, scripted evidence) is kept at `examples/routing/runs/2026-09-22-routing-run.json`; the root `routing-run.json` is ignored so reruns do not show as changes. Scenario values are scripted demonstrations, not Jev measurements, calibration, a quality benchmark or proof of savings. Expected acceptable ids are used only after routing for evaluation. These routing scenarios do not extend the proposal-review fixture categories.

- **Schema/context bytes:** actual UTF-8 length of serialized task plus tool descriptors/schemas.
- **Estimated tokens:** `ceil(UTF-8 bytes / 4)` per serialized payload; a proxy, not provider usage.
- **Full baseline:** all available schemas, no routing call; acceptable-tool inclusion only. No claim about which tool an LLM would choose.
- **Lean total estimated input:** selected-schema context plus the compact router request. Router response estimates are reported separately. The extra request can outweigh schema savings.
- **Cheapest acceptable selected:** whether the selection includes the lowest estimated-cost acceptable tool still available within the per-tool budget; null if there is none.
- **Local timing:** the offline comparison including JS work, not provider or tool execution latency. Provider tokens and execution latency are null.

A live paired experiment must use the same synthetic tasks, actual proposer outcomes, pinned models, repeated trials, provider usage and latency, routing overhead, pricing, and cache/re-prefill effects. Context scoring remains gated on its separate cost model. Real repository content requires a reviewed egress policy before any provider integration.

## Experiment protocol: N tools in context vs Jev top-k

Roadmap phase 3, [issue #2](https://github.com/TypeSafeAI/jev-harness/issues/2). The runner is verified offline with fakes. The [2026-09-23 live report](routing-evaluation/2026-09-23.md) links three repetitions and a separate pilot: input usage decreased, but top-1 selection lost tool use on multi-step tasks. The report separates expected clarification from that regression and records reproduction limits.

**Hypothesis.** For a task and a permitted catalog of size N, routing through Jev (`choice` over the available ids plus `needs_clarification`, with the demo confidence floor and cost policy) and exposing only the selected schemas gives a proposer fewer input tokens per task without lowering the correct-tool rate, and the gap grows with N.

**Arms**, run on the same task in the same repetition, in alternating order per (run, task):

- **A · all N schemas.** Every permitted schema goes to the proposer. No Jev call.
- **B · Jev top-k.** `routeTools()` makes one Jev call; only the selected schemas go to the proposer. A routed clarification or no-match asks the user and makes no proposer call. An unavailable route selects nothing and is counted as unavailable; it is never replaced by the full catalog.

**Optional host prerequisites.** Pass `--with-prerequisites` to test a routing arm
that exposes each selected root and its host-declared prerequisites:

```sh
pnpm experiment:routing --with-prerequisites --format json
```

The fixed host map in `examples/routing/experiment.ts` declares that
`propose_patch` and `draft_test_proposal` each require `read_file`. It is
independent of evaluation labels and is never sent to Jev. `topK` still limits
selected roots. A top-1 patch route therefore exposes the read and patch schemas,
while `routing.selectedIds` still contains only `propose_patch`. The all-tools
arm, routing request, policy, and question set remain unchanged. Without the
flag, the experiment retains its historical selected-only behavior.

`assembleToolBundle()` checks the closed catalog, current availability, and
existing per-tool cost limit for every prerequisite. A missing or over-budget
prerequisite withholds the entire handoff; cancellation also exposes no schemas.
A selected route whose handoff is withheld records `context_withheld`, makes no
proposer call, and counts as incorrect. The table reports this as **Host withheld**,
separately from provider unavailability. Clarification and unavailable routes
retain their existing outcomes. The summed estimated cost is bookkeeping, not a
new total-budget policy. No prerequisite grants permission or executes a tool.

Opted-in artifacts retain `toolContext` with dependency version 1 and the full
host map. Each routed trial retains `bundle` status, root and prerequisite ids,
blocked ids, estimated cost, reason, and cancellation state; `exposedToolIds`
records the actual proposer menu. Replay recomputes the policy and bundle and
rejects inconsistent provenance or exposure. Historical v1 artifacts without
`toolContext` remain selected-only. Compare these configurations explicitly when
reporting results; combining them would hide the treatment being measured.

**Tasks.** `examples/routing/experiment-tasks.ts`. The five non-failure routing scenarios (read, patch, inspect, ambiguous, uncertain) run at three catalog sizes: small (N = 3, the demo catalog, comparable with the arena), medium (N = 8) and large (N = 20). Two synthetic intents target non-demo descriptors (search, test draft) at medium and large. That makes 19 tasks per run. The extra descriptors are synthetic and have no fixture handler; a call to one is recorded by the fixture host and answered with an error. Nothing executes.

**Label separation.** Tasks carry only an id, size, intent and synthetic files. Evaluation labels (`EXPERIMENT_LABELS`, copied from the scenario labels where reused) are a separate table. The runner never receives them; scoring joins them after all trials finish. Scripted fake distributions and the fake proposer script are separate tables again. Jev receives the pinned model, the untrusted-data note, the available descriptions and the clarification option. The proposer receives a frozen copy of the task text, the synthetic files and the exposed schemas, nothing else.

**Proposer.** Live mode reuses the arena's isolated Codex CLI host (`runCodex`): auth-only temporary home, read-only sandbox, disabled external tools, the bounded synthetic MCP fixture host. The approval list is the exposed descriptor ids so a call to a handler-less descriptor reaches the fixture host and is recorded instead of being declined unseen. Live Jev calls go through the same `choice` transport as the local `/api/route` host (`examples/host/jev-choice.ts`).

Pass `--model` with `--live` for repeatable model selection; it also fixes reasoning
effort to medium. Offline and `--table` modes reject `--model` because they do not
invoke the live proposer. The artifact records these requested settings, not provider-attested
model metadata. Omitting it retains the historical CLI-default behavior. New
artifacts retain bounded final answers, call statuses and pending proposals for
separate quality assessment. Structural routing diagnostics identify missing
options, probability-sum issues or model mismatches without retaining unexpected
provider text. Historical artifacts without these fields remain readable.

**Metrics**, per trial, per arm, per catalog size and paired per task:

- **Correct tool.** Task labelled *selected*: the proposer completed and called at least one acceptable id. Task labelled *clarify*: no tool was called (routed clarification, or a proposer answer with no call). The answer text is not graded, so a no-call refusal also counts as asking. *First call correct* is reported separately.
- **Reported usage.** Proposer input, cached input and output tokens as reported by the CLI, plus Jev input and output as reported by the provider. A trial total exists only when every called component reported that metric. Input and output have independent unknown counts. Unknown is never counted as zero.
- **Proxies.** `ceil(UTF-8 bytes / 4)` of the arena prompt plus exposed schemas, and of the exact Jev request body. They are labelled as proxies, kept apart from reported usage, and exclude the CLI's own system prompt and tool framing.
- **Jev calls and latency.** Call count and wall time around each routing call on the host.
- **Failures.** Routing unavailable, proposer failed or cancelled, routed clarification or no-match, and no-call answers are counted separately. Failed and cancelled attempts remain incorrect in the accuracy denominator, even if their trace was truncated. A completed truncated trace with no observed acceptable call is unknown; it cannot prove there was no acceptable call.

**What a result can claim.** Paired correct-tool rates and reported token totals on these 19 synthetic tasks, with this catalog, `jev-1.13.0`, the recorded proposer settings and this policy. **What it cannot claim.** One run is a signal, not a calibration. Proxies are not provider savings. The tasks are synthetic, so the result says nothing about real repositories. It does not measure dollars (Codex and Jev price differently), cache effects across trials, answer quality, or execution speed. Top-1 routing can starve a task that needs two tools (read, then patch); that shows up as a correct-tool miss in arm B and is part of the result, not noise.

**Run it offline** (default; scripted fakes, no network, no key):

```sh
pnpm experiment:routing                         # markdown table, clearly marked FAKE
pnpm --silent experiment:routing --format json  # artifact JSON
pnpm experiment:routing --table examples/routing/runs/<file>.json  # table from any artifact
```

**Run it live** (explicit; Val's decision, never automated). Prerequisites: `codex login` on the host with file-based sign-in, and `TYPESAFE_API_KEY` exported in the shell from your own secret store. The key is read only from the environment, passed only to the Jev transport, and never printed or written. Live mode is refused under `CI`.

```sh
pnpm --silent experiment:routing --live --model gpt-6-sol --runs 3
```

This writes `examples/routing/runs/<date>-experiment.json` (it refuses to overwrite) and prints the table, which can be regenerated with `--table`. Three runs make 57 Jev calls and up to 114 Codex CLI runs (fewer when Jev routes to clarification), sequentially, so expect tens of minutes and both providers' usage. Use `--sizes small,large` or `--runs 1` for a smaller first pass, and `--top-k 2` to test the two-tool starvation case. Commit the artifact and link it next to any number quoted from it.

Ctrl-C or termination aborts the active request or Codex child, waits for cleanup, and saves completed and interrupted trials with `status: "cancelled"`. The table labels these as partial results; planned repetitions are not completed repetitions. The CLI exits with 130 for SIGINT or 143 for SIGTERM.

`--table` checks canonical task/catalog metadata, pinned request fields, finite measurements and consistent trial outcomes before recomputing its summary. Invalid or contradictory artifacts are rejected. These checks establish structural consistency, not the provenance or authenticity of a claimed live run.
