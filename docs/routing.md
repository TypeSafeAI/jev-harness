# Routing evidence and dynamic tool context

This is an offline demonstration of a host boundary, not an agent runtime. A host supplies a catalog and current availability, a routing adapter supplies evidence, and code selects descriptors to show to a proposer. No tool, specialist, model proposer, patch, or proposed code executes.

## Review of the proposed direction

| Proposal | Implementation and boundary |
| --- | --- |
| Explicit state and structured actions | Validated catalog with a small closed-object JSON Schema subset. Existing `Proposal` and review verdicts are unchanged. |
| Dynamic tools and sub-agents | Availability is supplied per request. A sub-agent is a descriptor, with no launch capability. |
| Cost-aware routing | Probability floor and relevance window establish eligibility; estimated cost orders eligible tools, then probability and id break ties. |
| Load and compact context | Full mode includes all available schemas; lean mode includes selected schemas. Explicit load/eviction transitions permit reloading. No semantic compaction or context scoring. |
| Transparent chat UI | A separate synthetic browser host can display the same receipts, descriptors and context comparison. |
| Measure efficiency and speed | Record schema bytes, estimated tokens, acceptable-tool inclusion, cheapest acceptable selection and local comparison time. Live model accuracy, billed tokens, cache effects, dollars and execution latency remain unmeasured. |

The original description assumed a loop and tool executor already existed. They do not, and adding them would cross this repository's evidence/authority boundary. Phase 1 extraction still waits for playground PR #41 to merge. This independent routing experiment does not reconstruct that pending code.

## Contract

`createCatalog()` validates and snapshots descriptors. Ids are unique lowercase identifiers; `needs_clarification` is reserved. Each schema is a closed object with string, number or boolean properties, descriptions and declared required keys. This is a deliberately limited schema vocabulary, not an arbitrary JSON Schema validator or an argument validator. Unsupported schema keywords are rejected rather than silently removed. Catalogs cannot carry handlers through normalization.

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

The output is the run artifact: command, timestamp, labels, paired contexts, metrics, local comparison duration and every routing receipt. Link that artifact whenever reporting numbers. Scenario values are scripted demonstrations, not Jev measurements, calibration, a quality benchmark or proof of savings. Expected acceptable ids are used only after routing for evaluation. These routing scenarios do not extend the proposal-review fixture categories.

- **Schema/context bytes:** actual UTF-8 length of serialized task plus tool descriptors/schemas.
- **Estimated tokens:** `ceil(UTF-8 bytes / 4)` per serialized payload; a proxy, not provider usage.
- **Full baseline:** all available schemas, no routing call; acceptable-tool inclusion only. No claim about which tool an LLM would choose.
- **Lean total estimated input:** selected-schema context plus the compact router request. Router response estimates are reported separately. The extra request can outweigh schema savings.
- **Cheapest acceptable selected:** whether the selection includes the lowest estimated-cost acceptable tool still available within the per-tool budget; null if there is none.
- **Local timing:** the offline comparison including JS work, not provider or tool execution latency. Provider tokens and execution latency are null.

A live paired experiment must use the same synthetic tasks, actual proposer outcomes, pinned models, repeated trials, provider usage and latency, routing overhead, pricing, and cache/re-prefill effects. Context scoring remains gated on its separate cost model. Real repository content requires a reviewed egress policy before any provider integration.
