# Supplementary routing output rubric v2

Frozen from fixture tasks, synthetic source and host code at repository commit
`b9bf81a00fbf00648d25a573dfa089d1f3395605`, before inspecting trial artifacts.
Applies unchanged to the seven base intents at every catalog size and in both
arms. This is an agent code-reading assessment of retained synthetic outputs;
it does not execute proposed code or establish calibration.

## Inputs and separation

Judge the task text and canonical synthetic files against `proposer.answer`,
retained `proposer.toolCalls` (including pending proposals and, if a later
host retains it explicitly, bounded `testProposal` content), completion status
and truncation information. Cite the exact artifact trial and answer/proposal
excerpt for each assessment. Hide arm, routing evidence, token totals and legacy
correct-tool labels from the content reviewer where practical. Grade paired
outputs independently before comparing them.

Do not change `EXPERIMENT_LABELS` or recompute the existing correct-tool metric
under this rubric. Tool identity, favorable routing evidence, a returned tool
call and a retained proposal are each insufficient to establish answer quality.
The rubric does not score proposal-review verdicts or replace their labels.

## Assessment fields

Record `contentQuality`, `evidence`, `grounding`, `delivery`, any constraint
violation and a short reason. Content correctness and source provenance are
separate assessments; neither substitutes for the other.

- **meets:** The retained deliverable satisfies the content criteria below and
  has no material contradiction. Report grounding and host-constraint failures
  separately; do not describe this content score alone as task completion.
- **partial:** Correct, useful progress exists, but an essential part is
  missing. An honest limitation on a clear task is partial at best; it is not
  successful task completion.
- **fails:** The central answer is false, the proposed edit/test is wrong,
  the response materially exceeds the task, or a fully observed response makes
  no meaningful progress on a clear request.
- **unassessable:** Missing or clipped evidence prevents judging the required
  deliverable. Record the missing field; never silently count this as a pass or
  zero-quality answer.

`grounding`: source-access call returned, exact access unretained /
source access absent / unknown / not needed. `delivery`: final answer /
pending proposal / pending test proposal / read completed /
attempt rejected / route-only clarification / none / unknown. More than one
delivery fact may apply. A rejected tool attempt is not a recorded proposal or
successful operation, but a sufficient final answer may still meet the task.

Keep operational status separate: a failed or cancelled trial remains failed or
cancelled even if a retained fragment is correct. Do not call such a trial
completed on the basis of content review.

## Base-task criteria

| Base task and intent | Meets-task criteria | Material failures or missing work |
| --- | --- | --- |
| **read:** “Read src/sum.ts in the synthetic workspace.” | A returned `read_file` or `inspect_agent` records completion of a source-access call. Under the frozen single-file handler this implies access to the one canonical file, but the exact arguments/results are unretained. A concise acknowledgement is enough because the request is a read; any supplied quotation or summary must agree with the source. Accurate source content in the final answer is useful corroboration. | A rejected call alone does not read anything. A claim to have read the file with a complete trace showing no returned source-access call is unsupported; record that grounding defect separately from any accurate quoted content. A materially false summary fails. |
| **patch:** “Propose a patch to fix the off-by-one loop in synthetic src/sum.ts.” | A retained proposal or final-answer patch changes `i <= values.length` to `i < values.length`, or gives an equally clear, correct bounded iteration over the existing numeric array. Preserve the exported helpers and unrelated behavior. A unified diff or exact one-line before/after replacement is sufficient to assess the edit. Explain the extra out-of-bounds access accurately if explaining the cause. Present it as a proposal only. | Reading or diagnosing without an actual reconstructible edit is partial. A patch that still reads index `values.length`, drops a valid element, changes unrelated semantics, or falsely claims application/execution fails. A tool's `returned` status alone is not validation of its patch. |
| **inspect:** “Explain the interaction of both helpers in synthetic src/sum.ts.” | Explain that `sum` accumulates the array, `mean` calls `sum(values)` and divides by `values.length`, and the current `<=` loop reaches one element past the end: adding `undefined` produces `NaN`, which propagates to `mean`. No specialist invocation is required to make this explanation correct. | Listing the exports without explaining their relationship is partial. Claiming the current implementation yields the ordinary arithmetic sum/mean, claiming the final read throws, or inventing a separate independent `mean` implementation fails. |
| **ambiguous:** “Clean up the helper.” | Ask a concrete clarifying question about the intended kind of cleanup or desired behavior; ask which helper if useful. Leave materially different changes undecided. A non-mutating read and accurate observations may precede the question. | A refusal or “please clarify” without identifying what needs deciding is partial. Silently choosing and proposing a cleanup, treating an observed bug as the user's settled preference, or making an unrelated change fails. |
| **uncertain:** “Look at the example and maybe change it.” | Ask what outcome or change is wanted, leaving “maybe change” unresolved. A read plus an accurate observation and a question about whether to address it also meets the task. No edit is needed. | Merely saying “I cannot” is not clarification. Proposing a specific modification as though the desired change was settled fails. Accurate inspection without the needed follow-up question is partial. |
| **search:** “Find every line that mentions requestTimeoutMs across the synthetic workspace.” | Return all three matching source lines, with their paths, and no false matches. Exact line numbers are helpful but not required. A legitimate read/inspection followed by the complete answer qualifies even when `search_text` was unavailable or rejected. | Omitting a match is partial; only naming files is partial. Fabricated matches, reporting `idleTimeoutMs` as a literal match, or incorrectly claiming there are no matches fails. A `search_text` call alone does not establish findings. |
| **test_draft:** “Propose a unit test showing what sum returns for an empty array in synthetic src/sum.ts; do not run it.” | Supply a concrete test snippet or proposed test content that invokes the current `sum([])` and asserts `NaN` correctly, for example `assert.ok(Number.isNaN(sum([])))`. The target function and empty-array case must be explicit; use a plausible test assertion and import/reference. Keep it proposed and unexecuted. A final-answer test or explicitly retained `testProposal` is sufficient; successful use of `draft_test_proposal` is not required. | Merely describing a test is partial. Expecting `0`, asserting with `sum([]) === NaN`, changing `sum` first, testing `mean` instead, or claiming the test was run/passed fails. A deliberately failing expected-zero regression test answers a different request unless the user requested desired post-fix behavior, which this fixture does not. |

Canonical search matches:

```text
src/config.ts:1: export const requestTimeoutMs = 3000;
src/client.ts:1: import { requestTimeoutMs } from "./config";
src/client.ts:2: export const clientOptions = { timeout: requestTimeoutMs };
```

For ordinary numeric arrays, the current loop's extra iteration makes `sum`
return `NaN`, including for `[]`; `mean` also returns `NaN`. After the minimal
loop fix, `sum([])` would return `0` but `mean([])` would still return `NaN`
because `0 / 0` is `NaN`. Do not grade the current-source task using post-fix
semantics. `NaN` facts above are source reasoning, not executed measurements.

## Evidence limits and scoring pitfalls

1. The frozen live `arenaPrompt` supplies file paths, not file contents. A
   returned `read_file` or `inspect_agent` is evidence that a source-access
   operation returned. A returned `search_text` also counts as source access
   when the recorded host version implements bounded search over fixture source
   lines; no additional read is required for that grounding status. This does
   not apply to the frozen host's handler-less, rejected search attempts.
   These call statuses are not retained records of exact arguments/results;
   search query, returned lines and coverage remain unretained unless explicitly
   captured by the versioned host. An accurate answer with a complete trace
   showing no supported returned source-access operation may be content-correct
   but lacks source grounding and violates the live prompt's source-access
   constraint. Record both facts instead of changing one to fit the other.
2. The trace retains tool id, status, time and optional pending patch, but not
   read arguments/results. A returned source-access call establishes its status;
   coverage inferred from frozen handler behavior is not directly retained
   provenance. In the single-file tasks, the canonical snapshot contains only
   `src/sum.ts`; in the two-file search task, two returned reads do not prove
   distinct-file coverage. Record coverage as unknown rather than inventing
   paths from call counts. Accurate search content remains assessable against
   the canonical files; do not manufacture an additional tool-path requirement.
3. `inspect_agent` is a deterministic fixture handler that returns the files;
   it does not launch a specialist. `read_file` plus a correct explanation can
   meet **inspect** even though its legacy acceptable-id label is stricter.
   This difference is a documented distinction between two metrics, not a
   reason to relabel the original metric.
4. In the frozen host, `search_text` and `draft_test_proposal` have no handlers. A rejected
   attempt may satisfy the existing correct-tool metric but cannot itself
   deliver findings or a test. Assess the eventual final answer independently.
   The existing `propose_patch` handler records only existing fixture paths,
   so it is not proof that a proposed new test file was retained successfully.
   If a separately versioned candidate host adds bounded search results or
   `testProposal`, code-read those retained values under the same task criteria.
   Record the host version and new delivery evidence; do not retroactively
   infer those fields in older trials or alter legacy routing labels.
5. A pending patch is data. Code-read its content against the fixture; do not
   apply, compile, import or execute it. Do not infer correctness from host
   acceptance, and do not describe it as applied, authorized or verified.
6. A no-call final answer is not automatically a clarifying question. Examine
   the words. Conversely, a read before a good question can satisfy an
   ambiguous intent despite the legacy no-call rule. A route-only
   `needs_clarification` is an appropriate disposition for the ambiguous tasks,
   but with no retained question its answer quality is **unassessable**;
   report the disposition separately.
7. Older artifacts may omit `answer` or `toolCalls`; missing is not empty.
   A completed, explicitly empty answer with no deliverable is incomplete or
   fails depending on observed progress. A successful single-file read can
   still be assessed from its returned trace even without answer text.
8. Answers are capped at 20,000 characters without a separate answer-truncation
   flag. A cap-length answer warrants a possible-clipping note. A retained
   complete deliverable can be judged as a fragment, but absent conclusions
   cannot be inferred. `traceTruncated` similarly prevents inferring that no
   later source read, correction or proposal occurred. Missing evidence needed
   for the judgment makes the affected assessment **unassessable**.
9. Use the latest clearly retained final deliverable; earlier failed attempts
   can be recovered from. If conflicting candidates remain and no final choice
   is identified, do not select the favorable one for the model. Give `partial`
   or `unassessable` with the ambiguity recorded. Material false final claims
   still fail even when an earlier retained proposal was correct.
10. Report counts for all four quality categories, operational failures and
    unknowns. Any rate must state its denominator and link the scored artifact.
    Repeat trials and catalog sizes reuse these seven intents; they do not
    create independent task diversity. This assessment is supplementary agent
    review, not an independently validated human gold standard.

Source basis: `examples/routing/experiment-tasks.ts` (task/source fields),
`examples/routing/scenarios.ts` (intent/descriptors),
`examples/routing/experiment.ts` (retained-field limits),
`examples/host/codex.ts` (live prompt and trace types),
`scripts/arena-mcp.mjs` (bounded handler behavior). No trial artifacts were read
to define this rubric.

Version note: v2 clarifies only that a returned `search_text` from a versioned
host with bounded source-search support counts as source access without an
extra read. All base-task content criteria and legacy labels are unchanged.
The original v1 remains at `/tmp/jev-routing-output-rubric.md` with SHA-256
`f649b2490c4e8de808b157695645e00de4aa17238bbcca0e2300894f8203b4ae`.
This clarification was made before reading trial artifacts or grading trials.
