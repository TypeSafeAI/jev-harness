# Architecture

An LLM proposes one action; Jev supplies semantic evidence; deterministic code
produces a verdict; the host owns authorization, storage, and any execution.
This package is not a full agent runtime. No proposal executes here.

## Roles and trust boundaries

| Role | Owner | Boundary |
| --- | --- | --- |
| Proposer | Scripted fixture or host-supplied model | Cannot grant itself permission or create trusted provenance |
| Proposal validator | `src/contract/validate.ts`, run by the host | Pure checks of schema, scope, paths, and diff against a host-supplied file snapshot, before provider calls |
| Semantic reviewer | Host transport using Jev | Supplies probabilities, not authority; sees only approved-for-egress context |
| Decision | `src/contract/decide.ts` | Pure runtime checks and deterministic verdicts; no I/O |
| Evidence audit | Optional `src/audit/receipt.ts` | Node hashing and offline replay; no authentication or persistence |
| Authorization and execution | Host only | Independently checks identity, grants, capabilities, freshness, and outcomes |

Repository content, quoted evidence, and rationale are untrusted data. A
model-generated field does not acquire authority by matching a schema. A local
read grant does not automatically allow uploading that file to a provider.

## Implemented pipeline and pending pieces

The root exports shared types, `decide`, `unfavorable`, threshold, and immutable
question/direction/tool metadata, plus the pure routing API. It also exports the
phase 1 pieces re-diffed against merged playground PR #41 at
`6fe5967dc020521a0731682b06c4d8eeeab95ffb`: `validateProposal` (zod schema, path, and single-file diff checks
against a snapshot the caller passes in), `buildReviewPayload`,
`validateReviewPayload`, `parseReviewAnswers`, and `reviewProposal` over an
injected `JevTransport`. None of these read files, call a network, or read the
environment. `decide()` still checks a supplied validation result; it cannot
prove the host ran the validator. A live transport and durable log store are
not part of this package.

The playground consumes a byte-for-byte vendored subset of merged harness
revision `a8a1a45a147c06abd197ff5d6004fb78e682e3a6`, with the MIT license and a
full revision/hash manifest. Thin compatibility exports preserve its host import
paths. Provider transport, keys, routes, UI and the Node fixture loader stay in
the playground; its ordinary barrel excludes the base decision helper. The
[consumer delivery record](verification/phase1-consumer-2026-09-23.json) links
the merged integration and its offline, production and browser checks.

The intended host sequence is proposal -> validation -> permitted egress/review
-> decision -> receipt -> independent host policy. The host must avoid provider
calls on validation rejection; a pure result consumer cannot enforce call order.
No runner in this repository automatically records every step.

## Question sets

The exact four instructions and favorable directions are documented in
[README, Contract v1](../README.md#contract-v1). IDs remain `addresses_task`,
`evidence_supports`, `unrelated_changes`, and `needs_clarification`; favorable
directions remain yes, yes, no, no. `JEV_MODEL` remains `jev-1.13.0`.

`REVIEW_QUESTION_SET_VERSION` is 4. V2 changed only `addresses_task` and
`evidence_supports`. Task alignment considers actual code and operation order,
and recognizes an explicitly requested read or targeted inspection before a
concrete change. Evidence support separates an explicit request for a change
or inspection from factual and causal claims about existing behavior. A read
does not need to prove a defect first; unsupported or contradicted material
claims remain unfavorable even when the proposed patch is correct.
`unrelated_changes` and `needs_clarification` remain byte-identical to v1.
These are semantic changes, not calibration or a live improvement claim.
The decision table, threshold, model pin, fixture bytes and labels are unchanged.

V3 changes only `addresses_task` from v2. It evaluates progress from the single
proposed step, so a targeted read can determine how to implement a concrete
change without performing the edit itself. The evidence-support, scope and
clarification questions remain byte-identical to v2.

V4 changes only `evidence_supports` from v3. A clear user request establishes
why a change or inspection is wanted without needing an existing defect.
Every material factual or causal claim must still be checked against the
supplied source and evidence, even when the proposed edit is otherwise correct.
The task-alignment, scope and clarification instructions remain byte-identical
to v3. This is adaptive development tuning, not held-out calibration.

The phase 1 extraction used v1. Its instructions remain frozen as
`REVIEW_QUESTIONS_V1`; v2 and v3 are frozen as `REVIEW_QUESTIONS_V2` and
`REVIEW_QUESTIONS_V3` for provenance comparisons. The default builder uses v4.
Prior measurements must retain their original question-set versions rather
than being attributed to v4. Offline tests
check the exact serialized questions and unchanged instructions, not the
semantic correctness of the model's answers. The [v4 live development comparison](calibration/2026-09-25-question-set-v4.md)
retains every candidate and a separate frozen confirmation, without a held-out
calibration claim.

The [official Noul contract](https://docs.typesafe.ai/primitives/noul) supports
optional `criteria` with true/false descriptions. Historical stripping in the
playground was a local validation behavior, not an API-wide restriction.
[Wire-contract acceptance](hardening/07-noul-contract.md) requires testing the
actual post-validation request and versioning effective semantic changes.
`buildReviewPayload` sends question set v4 with type and instructions, no criteria.
V1, v2 and v3 also sent only type and instructions. The playground authored criteria text but
its payload validator dropped noul criteria before sending, so no recorded run
used them. That text is kept as `REVIEW_QUESTION_CRITERIA` and is not sent;
sending it would change effective semantics and needs a new question-set
version. `validateReviewPayload` preserves explicitly supplied `{ true, false }`
criteria and rejects malformed criteria instead of dropping them. Question
types must be exact `noul`, `choice`, or `score` strings; arrays and other
non-string values are rejected without coercion. Both the
builder and validator require the exact `JEV_MODEL` pin: aliases, other
versions, empty strings, and padded values throw before transport. An omitted
builder/review option still defaults to the pin; a request payload missing its
model is invalid. For `source: "jev"`, a reply missing the exact pinned model
returns null answers and an error, so the unchanged decision table returns
`unavailable`. Explicitly labeled mock replies retain `mock-scripted` model
provenance. This deliberately tightens the source implementation, which
accepted overrides and substituted the requested model for missing response
metadata. `tests/review-payload.test.ts` checks the request sent to transport
and both response paths. These transport checks are independent of question
wording changes; scripted fixture verdicts remain unchanged.

`reviewProposal` checks cancellation before dispatch and again after the
transport resolves. A pre-aborted signal makes no transport call; a transport
that ignores cancellation cannot return usable answers after the signal is
aborted. Both paths return null answers and a cancellation error, yielding
`unavailable` through the existing decision table.

Given probability of yes `p`, derive answer from `p >= 0.5` and confidence from
`Math.max(p, 1 - p)`. Confidence is not correctness. The threshold 0.8 remains
uncalibrated; a model pin is for reproducibility, not calibration.

## Hardened decision table

Configuration is checked first: a nonfinite threshold or value outside [0.5,1]
throws deliberately. For valid configuration:

| Condition | Verdict | Host receipt convention |
| --- | --- | --- |
| Malformed validation, false/non-boolean ok, or nonempty errors | `reject` | withheld |
| Null/missing/malformed review envelope, null answers, or any review error | `unavailable` | withheld; never a base fallback |
| Present answer object with missing, invalid, contradictory, unfavorable, or below-threshold entries | `proposal_only` | recorded pending |
| All four canonical favorable answers meeting the threshold | `permit` | recorded pending; evidence only |

Success validation requires a boolean true and an empty string-array error
list. Canonical answer triples require finite probability in [0,1], confidence
in [0.5,1], and exact agreement with the derivation. Success/failure review
types are mutually exclusive, and runtime parsing remains required. Data-record
checks do not constitute a sandbox for malicious same-process JavaScript.
Error arrays must be dense plain data; custom iterators, index getters, and
decorated arrays are rejected without invocation. Every failing question is named
in the decision reason, and canonical fixture verdicts remain unchanged.

Question IDs, directions, and tool metadata are frozen and readonly. A policy
change must be reviewed and versioned, not implemented by mutating an export.
Detailed behavior and regression coverage are in the [hardening index](hardening/README.md).

## Receipt v1 and the optional audit adapter

`Receipt.schemaVersion` remains 1 and `execution.applied` remains false.
The host constructs the receipt and sets `recorded_pending` or `withheld`
according to the table. The root package performs no storage or transport.

The optional Node module `src/audit/receipt.ts` provides `createBoundReceipt`
and `replayBoundReceipt`. Its separate bindingVersion 1 envelope includes the
host-supplied immutable decision revision, policy version, threshold, question
version, model/source, exact serialized request, task, and file snapshot.
The adapter hashes bounded canonical JSON and checks stored verdict/status
against offline replay and independently supplied expected binding.
Enum fields require exact strings. Any validation rejection must have no retained
review provenance. The encoding budget includes escaped strings, keys, and
punctuation and is enforced before joining containers. Creation checks the
complete envelope, including integrity metadata, against the replay limits.
Question-set bindings must match the current `REVIEW_QUESTION_SET_VERSION`.
A prior v1, v2 or v3 bound receipt requires the corresponding historical code and
its independently trusted binding for replay; current v4 code rejects all three.
Do not relabel the receipt or substitute v4 questions to make it replay. Receipt schemaVersion
and bindingVersion remain 1; they are separate from the question-set version.

A SHA-256 digest is not a signature and does not authenticate a malicious
writer. Host-authenticated provenance, protected storage, deployment identity,
retention and egress rules remain necessary. Read the
[receipt-binding limitations](hardening/05-receipt-binding.md) before integration.

## Benchmark and evaluation separation

The root API does not export `decideBase`. Explicit `src/benchmark` imports
return validate-only results marked base/none/not-reviewed. Internal deep
imports remain possible in a source-only package and confer no authorization.
A provider failure must never invoke the base helper as a fallback.

`src/benchmark/evaluation.ts` counts pipeline cases, provider attempts, retries,
unique semantic cases, and abstentions separately. It rejects mixed treatment
labels, changing structural validation for the same frozen case, and duplicate
observations. Arrays are copied from own data entries without invoking custom
iterators or getters. `prepareProposerInput` whitelists and copies
only task/files/evidence before a `BlindedProposer` sees them. The original
labeled `Proposer` remains a scripted-fixture interface, not a blinded study
contract. These helpers do not run a benchmark or authenticate labels.

The extracted fixture bench lives beside them: `fixtures.ts` (zod fixture
schema), `proposer.ts` (scripted `FixtureProposer`), `mock.ts` (labeled mock
transport keyed by the proposal in the request state), `run.ts` (one pass of
propose, validate, review, decide, receipt), `bench.ts` (pure aggregation),
and the Node-only `load.ts`, which is not re-exported. The runner's base mode
uses the benchmark `decideBase`; it never substitutes for a failed review, and
no receipt it produces records an applied change. `pnpm bench:review` runs the
25 synthetic fixtures offline with the mock transport and prints scripted
totals, not measurements.

The `clean-read-before-edit-content-not-in-evidence` fixture pairs a read with an
unsupported guessed edit: the bad proposal claims an ignored legacy field
controls upload retries, contradicting the inline documentation. Question sets
v1, v2, v3 and v4 supply all fixture files to Jev, even when quoted evidence contains only
the task. None can establish the proposer's read history or enforce read before
edit. Only the scripted mock isolates an `evidence_supports` miss; a live review
may flag other questions too.

The [prospective issue #5 follow-up](calibration/2026-09-23-followup-plan.md)
adds four pairs for false causal justification of a correct edit, copy/sort
operation order, instructions in a rationale that accompanies a wire-code change,
and conflicting current policies. Labels and mock probabilities are frozen
before live measurement. The original 21 cases and the v1 decision policy stay
unchanged. The [live follow-up](calibration/2026-09-23-followup.md) records the
expanded suite and retains the uncalibrated 0.8 floor.

## Host seams and acceptance

The routing contract, offline comparison, and optional synthetic live example
host are implemented. The [initial repeated live experiment](routing-evaluation/2026-09-23.md)
records token usage and tool calls, including the top-1 multi-step regression;
production integration remains pending. Planned host work includes the Rust
`ProposalReview` seam and `ContextScorer` (relevance per chunk). A context-scoring experiment needs an egress policy and a
cost model comparing scoring/re-prefill with forfeited prefix-cache reuse. The
[ContextScorer cost model](context-scoring-cost-model.md) records a no-go for
integration code and a conditional go for a synthetic shadow experiment: with
cache reads at 0.1× input price, a stable context block breaks even only when
scoring drops at least `s·(1 − r) + ρ·(1 + ε)` of it.
The planned Rust seam does not put provider HTTP clients into a pure crate;
transport stays in an appropriate host adapter.

The [host-conformance specification](hardening/08-host-conformance.md) defines
negative cases for missing/revoked grants, changed snapshots/proposals, denied
egress, unexpected model/source, timeout/cancellation, path races, independent
correctness failures, unknown outcomes, and persistence failure. These are
acceptance requirements, not completed tests against a real host.

Reconcile unknown outcomes before retrying. Never claim a pending action was
committed. Four favorable semantic answers do not replace independent tests,
authorization, or isolated execution. Future evaluation must follow the
[held-out accounting and blinding plan](hardening/09-evaluation.md).

## Routing experiment

`src/routing/` supplies a pure catalog, injected `ToolRouter` seam, deterministic selection policy and schema context assembly. It does not change proposal-review decisions. `examples/routing/` contains synthetic evidence and paired context evaluation. See [Routing evidence and dynamic tool context](routing.md) for outcome semantics, host adapter mapping, cost assumptions and the live-measurement gate.

The optional demo is a Next.js App Router host (`app/`, `components/`, `examples/host/`). The Arena is the sole application page, with Compare/History/Integrate views, native radio example cards and modal detail drawers. React retains key controls and the usage dialog. A browser-only adapter outside `src/` stores bounded, versioned run snapshots. Pure history helpers validate stored data and restrict trend pairs to complete lanes with matching fixture contents and setup revision; missing metrics remain unknown. This cache is inspectable evidence, not authenticated provenance or execution authority. The host adapter is not exported by `src/`. Explicit live requests rebuild the fixed choice payload and validate evidence before browser policy/context assembly. The arena uses the same routing core to choose the MCP tool list for a fresh Codex CLI process; its host can read synthetic fixtures and record pending proposals, never apply or execute them. Server credentials remain server-only; personal overrides follow the playground's masked origin-local storage behavior. See [the demo guide](routing-demo.md) for credentials, process isolation, egress, usage and failure boundaries.

`examples/arena/lessons.ts` derives versioned observations and testable recommendations from a settled `ArenaRun`. It uses reported scalar metrics, routing outcome and both tool traces, never treats an answer or rationale as instructions, and makes no I/O or policy changes. Paired input/time deltas require a complete run and complete lanes; integrated totals include Jev. Invalid or missing numbers remain unknown. Rejected calls, absent tool evidence and truncated traces in either lane precede performance tuning. The UI derives lessons for current or reopened snapshots and attaches the analysis version and source run id to downloads; it does not change the stored run schema or infer correctness, causal effects or monetary savings.


`prepareToolContext` is an additive routing composition API, not a runtime or dispatcher. It snapshots the requested mode and previous context before awaiting `routeTools` once, then computes full and lean contexts from that same previous state. The explicitly requested shadow mode selects full context even after failed routing; lean selects only routed schemas. Cancellation leaves active context empty in either mode while retaining comparison evidence. Hosts must consume `context`, discard stale handoffs and independently enforce dispatch policy. The standalone synthetic integration example demonstrates outcomes and availability changes without provider or tool calls.

Human answer assessments use a separate versioned, bounded browser store keyed by run ID. They never alter `ArenaRun`, Jev evidence or policy. History filters only its chart subset, preserving every run in the list and reporting review coverage; passing annotations do not establish correctness. Failed writes retain prior data and edited drafts; conflicting external edits require an explicit reload. Comparison downloads label annotations as human-supplied. The static integration prompt contains no run content, credential or annotation. See [host adoption and measurement](integration.md).

`assembleToolBundle` is an optional pure handoff helper for host-declared tool
dependencies. It leaves Jev's receipt and selected roots unchanged, expands a
validated acyclic dependency graph, and assembles only available descriptors
within the existing per-tool cost limit. Missing or over-budget prerequisites,
non-selection and cancellation expose no schemas. `topK` still limits routed
roots; prerequisites add exposure and their costs are reported separately from
the unchanged routing evidence. Neither selection nor a dependency grants
permission. The Arena host declares `propose_patch → read_file`, records the
actual menu per lane. Prerequisite support introduced setup revision 2; routing
semantics v2 introduced setup revision 3 and v3 introduced setup revision 4.
Routing semantics v4 uses setup revision 5 so earlier setups do not enter current
comparison trends. Prerequisites do not change review verdicts or routing policy.

Routing question-set version 2 clarifies that `inspect_agent` returns synthetic
source context for inspecting behavior, relationships, and defects. The host
returns fixture files with a general grounding note, without launching a model
subagent. Version 3 changed only the generic choice instruction: a tool may
advance a clear task by supplying source evidence for the caller to reason about,
without producing the final answer itself. It remains a historical development
candidate. Version 4 distinguishes the requested operation or deliverable from
a preliminary read, while retaining
source inspection as evidence for the caller's explanation. Ambiguous outcomes
or missing capabilities still call for clarification. The v2 catalog, schemas,
availability, costs, host prerequisites, and routing policy remain unchanged,
including the `0.7` confidence floor. Proposal-review questions and verdicts
are unchanged.

Versions 1, 2, and 3 retain their exact wire instructions and catalog semantics for
replay; artifact parsing uses the matching catalog for policy and prerequisite
checks. Versions 3 and 4 share the v2 catalog. Arena history preserves all four
receipt versions. Unsupported question versions are rejected. The v4 hypothesis
is that matching the requested operation preserves edit roots and recognizes
source inspection for explanation tasks. This integration preserves the frozen
v4 candidate alongside fixture host revision 1 and proposal-review v4. Full CLI
measurement and answer-quality assessment of that combination remain pending. See
[requested-operation instruction v4](routing.md#requested-operation-instruction-v4).

Fixture host revision 1 adds literal bounded search over supplied synthetic
files and exact, unevaluated test-source recording in a separate
`ToolCall.testProposal` field. New experiment artifacts and Arena snapshots
record `fixtureHostRevision: 1`; absence retains historical host provenance.
Pure host helpers outside `src/` share path, argument and combined patch/test
recording limits with artifact and history readers. Proposed source is never
parsed, imported or executed, and no proposed files are created or modified.
This host revision does not change contract verdicts, the default Arena menu,
or routing question semantics. See
[fixture host bounds and assessment limits](routing.md#fixture-host-revision-1).
