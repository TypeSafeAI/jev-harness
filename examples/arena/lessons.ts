import type { ArenaRun } from "./history.js";

export interface LessonRecommendation {
  id: string;
  title: string;
  scope: "This arena" | "Host experiment";
  evidence: string;
  next: string;
  check: string;
}
interface Pair { baseline: number | null; integrated: number | null; delta: number | null }
export interface RunLessons {
  analysisVersion: 1;
  source: "local-rules";
  runId: string;
  fixtureId: string;
  comparable: boolean;
  qualityAssessed: false;
  headline: string;
  measurements: { input: Pair; duration: Pair; tools: Pair; calls: Pair; routerInput: number | null; routerDuration: number | null };
  recommendations: LessonRecommendation[];
  caveat: string;
}
const count = (n: number | null | undefined): number | null => n != null && Number.isSafeInteger(n) && n >= 0 ? n : null;
const duration = (n: number | null | undefined): number | null => n != null && Number.isFinite(n) && n >= 0 && n <= 86_400_000 ? n : null;
const sum = (a: number | null, b: number | null) => a === null || b === null || !Number.isSafeInteger(a + b) ? null : a + b;
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const seconds = (n: number) => `${number(n / 1000)} s`;

/** Observations and testable experiments only. Never consumes answers as instructions or changes policy. */
export function analyzeRun(run: ArenaRun): RunLessons {
  const base = run.lanes.baseline?.result, integrated = run.lanes.integrated?.result;
  const comparable = run.status === "complete" && base?.status === "completed" && integrated?.status === "completed";
  const pair = (baseline: number | null, withJev: number | null): Pair => ({ baseline, integrated: withJev, delta: comparable && baseline !== null && withJev !== null ? withJev - baseline : null });
  const routerInput = count(run.jevUsage?.inputTokens), routerDuration = duration(run.jevUsage?.latencyMs);
  const baseInput = count(base?.inputTokens), cliInput = count(integrated?.inputTokens);
  const baseTime = duration(base?.durationMs), cliTime = duration(integrated?.durationMs);
  const integratedTime = cliTime !== null && routerDuration !== null ? cliTime + routerDuration : null;
  const input = pair(baseInput, sum(cliInput, routerInput)), time = pair(baseTime, integratedTime);
  const tools = pair(run.lanes.baseline ? run.lanes.baseline.tools.length : null, run.lanes.integrated ? run.lanes.integrated.tools.length : null);
  const calls = pair(count(base?.toolCallCount), count(integrated?.toolCallCount));
  const recommendations: LessonRecommendation[] = [];
  const add = (id: string, title: string, scope: LessonRecommendation["scope"], evidence: string, next: string, check: string) => recommendations.push({ id, title, scope, evidence, next, check });
  const outcome = run.receipt?.outcome;

  if (outcome === "needs_clarification") add("clarify", "Make the task specific before tuning", "Host experiment", "The harness returned needs_clarification; it did not select a tool menu.", "Name the target file and desired result in the host task. Preserve the clarification fallback instead of forcing a selection.", "Check that the clarified task selects a relevant tool and that its answer is grounded in the fixture. Keep the original vague task as a control.");
  else if (outcome === "no_match") add("tool-match", "Review task and catalog coverage", "Host experiment", "No catalog option passed the routing policy.", "Compare the intended task with the available tool descriptions, schemas and cost limits. Add missing capability only in the host; do not relax validation to produce a match.", "Evaluate the revised catalog on labeled tasks before changing routing thresholds.");
  else if (outcome === "unavailable" || (!run.receipt && !base && !integrated)) add("routing-unavailable", "Restore a routing result first", "This arena", "No usable routing result was captured for this comparison.", "Inspect the reported error and Usage. If the error concerns credentials, check Settings → Jev API key, then retry explicitly.", "Confirm both lanes return and Jev usage is reported before drawing a performance conclusion.");

  if (!comparable) add("complete-run", "Get a complete comparison", "This arena", `This run is ${run.status}; ${base?.status === "completed" ? "the baseline completed" : "the baseline did not complete"} and ${integrated?.status === "completed" ? "the integrated lane completed" : "the integrated lane did not complete"}.`, "Review the failed or interrupted lane and retry the same example after resolving its reported issue.", "Keep partial evidence, but compare input and time only when both lanes and the overall run complete.");
  else {
    const traces = ([['Without Jev', base, calls.baseline, tools.baseline], ['With Jev', integrated, calls.integrated, tools.integrated]] as const).map(([label, result, callCount, toolCount]) => ({ label, result, callCount, toolCount, complete: Boolean(result && !result.traceTruncated && result.toolCalls.length === callCount), rejected: result?.toolCalls.filter(call => call.status === "rejected").length ?? 0 }));
    const traceComplete = traces[1]!.complete;
    const rejected = traces.filter(trace => trace.rejected > 0);
    if (rejected.length) add("rejected-calls", "Fix rejected tool requests first", "Host experiment", rejected.map(trace => `${trace.label}: ${trace.complete ? "" : "at least "}${trace.rejected} rejected fixture ${trace.rejected === 1 ? "call" : "calls"}.`).join(" "), "Inspect those calls against required arguments, allowed paths and the tool schema. Clarify the task or descriptor while preserving validation and execution boundaries.", "Repeat the same task and check that required calls return valid results in both lanes, then compare input and time.");
    const empty = traces.filter(trace => trace.callCount === 0);
    if (empty.length && outcome === "selected") add("tool-evidence", "Check the answer’s evidence first", "This arena", empty.map(trace => `${trace.label}: ${trace.toolCount ?? "Unknown"} tools exposed, but no fixture call observed.`).join(" "), "Compare each answer with the task and fixture in Test setup. A completed CLI response alone does not show that it used the available capability.", "For tasks that need source evidence, confirm relevant fixture calls and grounded answers before treating lower usage as an improvement.");
    const incomplete = traces.filter(trace => !trace.complete);
    if (incomplete.length) add("trace", "Capture a complete tool trace", "This arena", `${incomplete.map(trace => trace.label).join(" and ")} ${incomplete.length === 1 ? "has an incomplete trace" : "have incomplete traces"}; absent events are not proof a tool was unused.`, "Inspect the retained traces and rerun a bounded example that fits the host’s trace limit.", "Use complete traces when judging which exposed tools were actually used.");
    if (input.delta === null || time.delta === null) add("measurements", "Fill the measurement gaps", "This arena", `${input.delta === null ? "Total input is unknown. " : ""}${time.delta === null ? "Total duration is unknown. " : ""}With-Jev totals require both CLI and routing measurements.`, "Inspect Usage in the run details and confirm the CLI and Jev both report the missing measurements on a repeat run.", "Leave missing values unknown; do not substitute zero or report savings from a partial total.");

    const inputOverhead = input.delta !== null && input.delta >= 0 && cliInput !== null && baseInput !== null && cliInput < baseInput;
    const timeOverhead = time.delta !== null && time.delta > 0 && cliTime !== null && baseTime !== null && cliTime <= baseTime;
    if (inputOverhead || timeOverhead) add("routing-overhead", "Test where routing pays for itself", "Host experiment", [inputOverhead ? `The CLI used ${number(baseInput! - cliInput!)} fewer input tokens, but Jev added ${number(routerInput!)}; total input ${input.delta === 0 ? "was unchanged" : `was ${number(input.delta!)} higher`}.` : "", timeOverhead ? `Routing added ${seconds(routerDuration!)}; the integrated total was ${seconds(time.delta!)} longer despite a CLI duration no greater than baseline.` : ""].filter(Boolean).join(" "), "Test a representative task with a larger relevant tool catalog, keeping this small task as a control. Review duplicate wording in routing descriptions before adding more context.", "Count Jev on every comparison. An improvement must survive repeated measurements and an answer-quality review, not just a smaller CLI total.");
    else if ((input.delta !== null && input.delta > 0) || (time.delta !== null && time.delta > 0)) add("inspect-work", "Inspect the extra work", "Host experiment", `With Jev${input.delta === 0 ? " used the same input count" : input.delta !== null ? ` used ${number(Math.abs(input.delta))} ${input.delta < 0 ? "fewer" : "more"} input tokens` : " has unknown total input"}${time.delta === 0 ? " and the same measured time" : time.delta !== null ? ` and ${seconds(Math.abs(time.delta))} ${time.delta < 0 ? "less" : "more"} measured time` : ""}.`, "Compare the tool traces and answer scope. Test one change at a time, such as removing redundant descriptor wording or requesting a consistent response format.", "Keep required schema fields and policy checks. Track the changed host setup separately, then compare repeated results and answer correctness.");

    if (tools.baseline !== null && tools.integrated !== null && tools.integrated >= tools.baseline && outcome === "selected") add("catalog", "Give routing a useful distinction", "Host experiment", `Without Jev exposed ${tools.baseline} tools; With Jev exposed ${tools.integrated}. No smaller menu was observed.`, "Review overlapping tool descriptions and test the catalog on labeled tasks. Preserve all capabilities required by the task rather than reducing top-k blindly.", "Measure selected-tool relevance and full input including routing on the revised setup.");
    if (traceComplete && calls.integrated! > 0) {
      const observed = new Set(integrated!.toolCalls.map(call => call.tool));
      const unused = run.lanes.integrated!.tools.filter(tool => !observed.has(tool)).length;
      if (unused) add("unused-tools", "Review unused exposure across runs", "Host experiment", `${unused} selected ${unused === 1 ? "tool did" : "tools did"} not appear in this complete integrated trace.`, "Check repeated labeled tasks before tightening the exposed menu. A tool not used once may still be required for another valid path.", "Retain required capability and compare tool coverage as well as total input; this run alone does not justify removing a tool.");
    }
    const baseCached = count(base?.cachedInputTokens), integratedCached = count(integrated?.cachedInputTokens);
    if (baseCached !== null && integratedCached !== null && baseInput && cliInput && baseCached <= baseInput && integratedCached <= cliInput && baseCached / baseInput !== integratedCached / cliInput) add("cache", "Account for unequal cache reuse", "Host experiment", `Baseline reported ${number(baseCached)} cached of ${number(baseInput)} input tokens; integrated reported ${number(integratedCached)} of ${number(cliInput)}.`, "Compare repeated runs under consistent cache conditions and record the CLI/model settings. Cache differences can accompany timing differences without establishing their cause.", "Track cached input separately. Token counts and elapsed work do not establish billed cost savings.");
    const baseOutput = count(base?.outputTokens), integratedOutput = count(integrated?.outputTokens);
    if (baseOutput !== null && integratedOutput !== null && baseOutput !== integratedOutput) add("answer-scope", "Hold the answer format constant", "Host experiment", `The baseline produced ${number(baseOutput)} output tokens; the integrated lane produced ${number(integratedOutput)}.`, "Compare full answers and request the same concise format from both lanes in a separate host experiment. Keep qualifications and evidence that the task needs.", "Check correctness and completeness before treating a shorter answer or shorter run as better.");
  }

  let headline = "Complete the comparison before optimizing";
  if (comparable) {
    if (input.delta === null || time.delta === null) headline = "Fill the measurement gaps";
    else if (input.delta < 0 && time.delta < 0) headline = "Less input and less measured time this run";
    else if (input.delta === 0 && time.delta === 0) headline = "No measured input or time difference";
    else headline = `${input.delta < 0 ? "Less" : input.delta > 0 ? "More" : "Same"} input · ${time.delta < 0 ? "less" : time.delta > 0 ? "more" : "same"} measured time`;
  }
  if (outcome === "needs_clarification") headline = "Clarify the task before optimizing";
  else if (outcome === "no_match") headline = "Review task and tool coverage";
  else if (outcome === "unavailable") headline = "Restore routing before optimizing";
  else if (comparable && recommendations[0]?.id === "rejected-calls") headline = "Resolve rejected calls before optimizing";
  else if (comparable && recommendations[0]?.id === "tool-evidence") headline = "Check tool evidence before optimizing";
  const repeat: LessonRecommendation = { id: "repeat", title: "Check the answer, then repeat", scope: "This arena", evidence: "One simulation is one observation. Independent agent choices, output and cache reuse can affect results.", next: "Inspect both answers against the task and fixture. Run the same example several times, then use History to compare input and time medians for the same setup.", check: "Prefer a change only when required tool coverage and answer quality hold up across repeated runs. Keep changed host setups separate." };
  return { analysisVersion: 1, source: "local-rules", runId: run.id, fixtureId: run.fixture.id, comparable, qualityAssessed: false, headline, measurements: { input, duration: time, tools, calls, routerInput, routerDuration }, recommendations: [...recommendations.slice(0, 3), repeat], caveat: "Local analysis of recorded evidence, not an additional model review. Recommendations are experiments, not proven causes or guaranteed gains. Answer quality and correctness are not scored; token and time differences are not monetary savings." };
}
