/**
 * Repeatable N-tools-in-context vs Jev top-k experiment (roadmap phase 3, issue #2).
 *
 * Arm `all_tools`: every permitted schema goes to the proposer; no Jev call.
 * Arm `jev_top_k`: `routeTools()` asks Jev once, then only the selected schemas go to the proposer.
 *   A routed clarification or no-match asks the user without a proposer call; an unavailable route
 *   selects nothing and is counted, never replaced by the full catalog.
 *
 * The runner never receives evaluation labels. Scoring joins labels afterwards. Nothing proposed is applied.
 */
import { JEV_MODEL } from "../../src/contract/types.js";
import { CLARIFICATION_ID, ROUTING_QUESTION_SET_VERSION, ROUTING_UNTRUSTED_DATA_NOTE, routeTools, type RoutingPolicy, type RoutingReceipt, type RoutingRequest, type ToolDefinition, type ToolRouter } from "../../src/routing/index.js";
import { arenaPrompt, runCodex } from "../host/codex.js";
import { jevChoiceBody, type JevMeasurement } from "../host/jev-choice.js";
import { EXPERIMENT_CATALOG, EXPERIMENT_TASKS, FAKE_PROPOSER_SCRIPT, EXPERIMENT_MOCKS, SIZE_TIERS, TIER_AVAILABLE_IDS, type ExperimentLabel, type ExperimentTask, type SizeTier } from "./experiment-tasks.js";

export const EXPERIMENT_SCHEMA_VERSION = 1;
export type Arm = "all_tools" | "jev_top_k";
export const ARMS: readonly Arm[] = ["all_tools", "jev_top_k"];

const bytes = (value: string) => new TextEncoder().encode(value).length;
/** Explicit proxy only: ceil(UTF-8 bytes / 4). Not a provider tokenizer. */
export const proxyTokens = (value: string) => Math.ceil(bytes(value) / 4);

/** Exactly what a proposer receives: the task text, synthetic files and exposed schemas. */
export type ProposerTool = Pick<ToolDefinition, "id" | "kind" | "description" | "inputSchema">;
export interface ProposerInput { readonly task: string; readonly files: Readonly<Record<string, string>>; readonly tools: readonly ProposerTool[] }
export interface ProposerResult {
  status: "completed" | "failed" | "cancelled";
  /** Tool ids in call order, as recorded by the fixture host (or the fake). */
  calledToolIds: string[];
  /** True when only the first 100 recorded calls are available. */
  traceTruncated: boolean;
  /** Provider-reported usage; null when the proposer does not report it. */
  inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null;
  error: string | null;
}
export interface Proposer { source: "fake" | "codex"; propose(input: ProposerInput, signal?: AbortSignal): Promise<ProposerResult> }
/** One router per routing call; `measurement()` returns provider-reported usage when the transport has it. */
export interface RouterHandle { router: ToolRouter; measurement(): JevMeasurement | null }

export interface ExperimentDeps {
  source: "fake" | "live";
  /** Receives only the task id so a fake can look up its scripted distribution. */
  routerFor(taskId: string): RouterHandle;
  proposer: Proposer;
  now?: () => number;
  signal?: AbortSignal;
  onProgress?: (line: string) => void;
}
export interface ExperimentOptions { runs: number; sizes?: readonly SizeTier[]; policy: RoutingPolicy; tasks?: readonly ExperimentTask[] }

export type TrialOutcome = "tool_called" | "no_tool_call" | "routed_clarification" | "routing_unavailable" | "proposer_failed";
export interface Trial {
  run: number; taskId: string; baseId: string; size: SizeTier; catalogSize: number; arm: Arm; order: 1 | 2;
  exposedToolIds: string[];
  routing: null | {
    outcome: RoutingReceipt["outcome"]; selectedIds: string[]; reason: string; source: "mock" | "jev";
    evidence: RoutingReceipt["evidence"]; optionIds: string[];
    jevCalls: number; latencyMs: number | null;
    reported: { input: number | null; output: number | null } | null;
  };
  proposer: null | { status: ProposerResult["status"]; calledToolIds: string[]; traceTruncated: boolean; durationMs: number; reported: { input: number | null; cachedInput: number | null; output: number | null }; error: string | null };
  outcome: TrialOutcome;
  firstToolId: string | null;
  proxies: { proposerInputTokens: number; jevRequestTokens: number; totalInputTokens: number };
}

/** Detached, frozen copy with only task/files/tools, so no extra field can reach a proposer. */
function proposerInput(task: ExperimentTask, tools: readonly ToolDefinition[]): ProposerInput {
  return Object.freeze({ task: task.intent, files: Object.freeze({ ...task.files }), tools: Object.freeze(tools.map(({ id, kind, description, inputSchema }) => Object.freeze({ id, kind, description, inputSchema: structuredClone(inputSchema) }))) });
}
/** The schemas a Codex MCP host lists (name, description, inputSchema) plus the arena prompt. */
function proposerProxy(input: ProposerInput) {
  return proxyTokens(arenaPrompt({ task: input.task, files: input.files }) + JSON.stringify(input.tools.map(t => ({ name: t.id, description: t.description, inputSchema: t.inputSchema }))));
}

async function runProposer(deps: ExperimentDeps, input: ProposerInput, now: () => number) {
  const start = now();
  let result: ProposerResult;
  try { result = await deps.proposer.propose(input, deps.signal); }
  catch { result = { status: "failed", calledToolIds: [], traceTruncated: false, inputTokens: null, cachedInputTokens: null, outputTokens: null, error: "Proposer adapter failed." }; }
  return { status: result.status, calledToolIds: [...result.calledToolIds], traceTruncated: result.traceTruncated, durationMs: now() - start, reported: { input: result.inputTokens, cachedInput: result.cachedInputTokens, output: result.outputTokens }, error: result.error };
}
function proposerOutcome(p: NonNullable<Trial["proposer"]>): TrialOutcome {
  return p.status !== "completed" ? "proposer_failed" : p.calledToolIds.length ? "tool_called" : "no_tool_call";
}

export async function runTrial(task: ExperimentTask, arm: Arm, run: number, order: 1 | 2, policy: RoutingPolicy, deps: ExperimentDeps): Promise<Trial> {
  const now = deps.now ?? (() => performance.now());
  const availableIds = TIER_AVAILABLE_IDS[task.size];
  const available = EXPERIMENT_CATALOG.filter(t => availableIds.includes(t.id));
  const base = { run, taskId: task.id, baseId: task.baseId, size: task.size, catalogSize: available.length, arm, order };
  if (arm === "all_tools") {
    const input = proposerInput(task, available);
    const proposer = await runProposer(deps, input, now);
    const proposerInputTokens = proposerProxy(input);
    return { ...base, exposedToolIds: available.map(t => t.id), routing: null, proposer, outcome: proposerOutcome(proposer), firstToolId: proposer.calledToolIds[0] ?? null,
      proxies: { proposerInputTokens, jevRequestTokens: 0, totalInputTokens: proposerInputTokens } };
  }
  const handle = deps.routerFor(task.id);
  let jevCalls = 0, latencyMs: number | null = null, sent: RoutingRequest | null = null;
  const counted: ToolRouter = { source: handle.router.source, async review(request, signal) {
    jevCalls++; sent = request;
    const start = now();
    try { return await handle.router.review(request, signal); } finally { latencyMs = now() - start; }
  } };
  const receipt = await routeTools(EXPERIMENT_CATALOG, { intent: task.intent, availableIds }, policy, counted, deps.signal);
  const measurement = handle.measurement();
  const jevRequestTokens = sent ? proxyTokens(jevChoiceBody(sent)) : 0;
  const routing = { outcome: receipt.outcome, selectedIds: [...receipt.selectedIds], reason: receipt.reason, source: receipt.source, evidence: receipt.evidence,
    optionIds: receipt.request.options.map(o => o.id), jevCalls, latencyMs,
    reported: jevCalls === 0 ? { input: 0, output: 0 } : measurement ? { input: measurement.inputTokens, output: measurement.outputTokens } : null };
  if (receipt.outcome !== "selected") {
    return { ...base, exposedToolIds: [], routing, proposer: null, outcome: receipt.outcome === "unavailable" ? "routing_unavailable" : "routed_clarification", firstToolId: null,
      proxies: { proposerInputTokens: 0, jevRequestTokens, totalInputTokens: jevRequestTokens } };
  }
  const selected = EXPERIMENT_CATALOG.filter(t => receipt.selectedIds.includes(t.id));
  const input = proposerInput(task, selected);
  const proposer = await runProposer(deps, input, now);
  const proposerInputTokens = proposerProxy(input);
  return { ...base, exposedToolIds: selected.map(t => t.id), routing, proposer, outcome: proposerOutcome(proposer), firstToolId: proposer.calledToolIds[0] ?? null,
    proxies: { proposerInputTokens, jevRequestTokens, totalInputTokens: proposerInputTokens + jevRequestTokens } };
}

/** Sequential by design: one provider call at a time. Arm order alternates per (run, task) to spread order and cache effects. */
export async function runExperiment(options: ExperimentOptions, deps: ExperimentDeps): Promise<Trial[]> {
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 50) throw Error("runs must be an integer from 1 to 50.");
  const sizes = options.sizes ?? SIZE_TIERS;
  const tasks = (options.tasks ?? EXPERIMENT_TASKS).filter(task => sizes.includes(task.size));
  const trials: Trial[] = [];
  for (let run = 1; run <= options.runs; run++) {
    for (const [index, task] of tasks.entries()) {
      const arms = (run + index) % 2 === 0 ? ARMS : [...ARMS].reverse();
      for (const [position, arm] of arms.entries()) {
        if (deps.signal?.aborted) return trials;
        deps.onProgress?.(`run ${run}/${options.runs} · ${task.id} · ${arm}`);
        trials.push(await runTrial(task, arm, run, position === 0 ? 1 : 2, options.policy, deps));
      }
    }
  }
  return trials;
}

// ---------------------------------------------------------------- fakes (offline default)

/** Scripted fake Jev: reads only EXPERIMENT_MOCKS and the request options. Missing mass goes to clarification. */
export function fakeRouterFor(taskId: string): RouterHandle {
  const baseId = EXPERIMENT_TASKS.find(t => t.id === taskId)?.baseId;
  const mock = baseId ? EXPERIMENT_MOCKS[baseId] : undefined;
  return { measurement: () => null, router: { source: "mock", async review(request) {
    const probabilities: Record<string, number> = Object.fromEntries(request.options.map(o => [o.id, 0]));
    for (const [id, mass] of Object.entries(mock?.weights ?? { [CLARIFICATION_ID]: 1 })) probabilities[Object.hasOwn(probabilities, id) ? id : CLARIFICATION_ID]! += mass;
    const choice = Object.keys(probabilities).sort((a, b) => probabilities[b]! - probabilities[a]!)[0]!;
    return { model: request.model, choice, confidence: mock?.confidence ?? 1, probabilities };
  } } };
}

/** Scripted fake proposer keyed by task text, which is all it is given. Reports no usage. */
export const fakeProposer: Proposer = { source: "fake", async propose(input) {
  const baseId = EXPERIMENT_TASKS.find(t => t.intent === input.task)?.baseId;
  const script = baseId ? FAKE_PROPOSER_SCRIPT[baseId] : undefined;
  const exposed = input.tools.map(t => t.id);
  const preferred = (script?.prefers ?? []).filter(id => exposed.includes(id));
  let calledToolIds: string[];
  if (!script || (script.whenMissing === "ask" && (script.prefers.length === 0 || preferred.length < script.prefers.length))) calledToolIds = [];
  else calledToolIds = preferred.length ? preferred : exposed.slice(0, 1);
  return { status: "completed", calledToolIds, traceTruncated: false, inputTokens: null, cachedInputTokens: null, outputTokens: null, error: null };
} };

// ---------------------------------------------------------------- live proposer (Codex CLI arena host)

/** Reuses the arena's isolated Codex host. Approves exactly the exposed descriptor ids so every call is recorded. */
export function codexProposer(executable = "codex"): Proposer {
  return { source: "codex", async propose(input, signal) {
    const result = await runCodex({ task: input.task, files: input.files }, input.tools, signal ?? new AbortController().signal, executable, undefined, input.tools.map(t => t.id));
    return { status: result.status, calledToolIds: result.toolCalls.map(call => call.tool), traceTruncated: result.traceTruncated, inputTokens: result.inputTokens, cachedInputTokens: result.cachedInputTokens, outputTokens: result.outputTokens, error: result.error };
  } };
}

// ---------------------------------------------------------------- scoring and summary

/**
 * Correct tool: for a task labelled `selected`, the proposer completed and called at least one acceptable id.
 * For `needs_clarification`, no tool was called (routed clarification, or the proposer answered without a call).
 * A no-call answer is treated as asking; the answer text is not graded. Unavailable and failed trials are incorrect.
 */
export function scoreTrial(trial: Trial, label: ExperimentLabel) {
  const acceptableCalled = trial.outcome === "tool_called" && trial.proposer!.calledToolIds.some(id => label.acceptableIds.includes(id));
  const correct = label.expectedOutcome === "needs_clarification"
    ? trial.outcome === "routed_clarification" || trial.outcome === "no_tool_call"
    : acceptableCalled ? true : trial.proposer?.traceTruncated ? null : false;
  const firstCallCorrect = label.expectedOutcome === "needs_clarification" ? correct === true : trial.firstToolId !== null && label.acceptableIds.includes(trial.firstToolId) && trial.outcome === "tool_called";
  return { correct, firstCallCorrect };
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: readonly number[]) => values.length ? sum(values) / values.length : null;
const median = (values: readonly number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
/** Reported input/output for a whole trial (proposer + Jev), or null if any called component did not report. */
export function reportedTotals(trial: Trial) {
  const parts = [trial.proposer ? trial.proposer.reported : { input: 0, output: 0 }, trial.routing ? trial.routing.reported ?? { input: null, output: null } : { input: 0, output: 0 }];
  const input = parts.every(p => p.input !== null) ? sum(parts.map(p => p.input!)) : null;
  const output = parts.every(p => p.output !== null) ? sum(parts.map(p => p.output!)) : null;
  return { input, output };
}

export interface ArmSummary {
  trials: number; correct: number; correctKnown: number; correctRate: number | null; firstCallCorrect: number;
  routedClarifications: number; noToolCalls: number; unavailable: number; failed: number;
  jevCalls: number; jevLatencyMedianMs: number | null;
  reportedInputMean: number | null; reportedOutputMean: number | null; reportedInputKnown: number; reportedUnknown: number;
  proxyInputMean: number | null; exposedToolsMean: number | null;
}
function summarizeArm(trials: readonly Trial[], labels: Readonly<Record<string, ExperimentLabel>>): ArmSummary {
  const scores = trials.map(t => scoreTrial(t, labelFor(labels, t.baseId)));
  const known = scores.filter(s => s.correct !== null);
  const correct = known.filter(s => s.correct).length;
  const reported = trials.map(reportedTotals);
  const inputs = reported.flatMap(r => r.input === null ? [] : [r.input]);
  const outputs = reported.flatMap(r => r.output === null ? [] : [r.output]);
  return {
    trials: trials.length, correct, correctKnown: known.length, correctRate: known.length ? correct / known.length : null, firstCallCorrect: scores.filter(s => s.firstCallCorrect).length,
    routedClarifications: trials.filter(t => t.outcome === "routed_clarification").length, noToolCalls: trials.filter(t => t.outcome === "no_tool_call").length,
    unavailable: trials.filter(t => t.outcome === "routing_unavailable").length, failed: trials.filter(t => t.outcome === "proposer_failed").length,
    jevCalls: sum(trials.map(t => t.routing?.jevCalls ?? 0)), jevLatencyMedianMs: median(trials.flatMap(t => t.routing?.latencyMs == null ? [] : [t.routing.latencyMs])),
    reportedInputMean: mean(inputs), reportedOutputMean: mean(outputs), reportedInputKnown: inputs.length, reportedUnknown: reported.filter(r => r.input === null || r.output === null).length,
    proxyInputMean: mean(trials.map(t => t.proxies.totalInputTokens)), exposedToolsMean: mean(trials.map(t => t.exposedToolIds.length)),
  };
}
function labelFor(labels: Readonly<Record<string, ExperimentLabel>>, baseId: string) {
  const label = labels[baseId];
  if (!label) throw Error(`No evaluation label for ${baseId}.`);
  return label;
}

export function summarizeExperiment(trials: readonly Trial[], labels: Readonly<Record<string, ExperimentLabel>>) {
  const byArm = Object.fromEntries(ARMS.map(arm => [arm, summarizeArm(trials.filter(t => t.arm === arm), labels)])) as Record<Arm, ArmSummary>;
  const sizes = SIZE_TIERS.filter(size => trials.some(t => t.size === size));
  const bySize = sizes.map(size => ({ size, catalogSize: trials.find(t => t.size === size)!.catalogSize,
    arms: Object.fromEntries(ARMS.map(arm => [arm, summarizeArm(trials.filter(t => t.size === size && t.arm === arm), labels)])) as Record<Arm, ArmSummary> }));
  const taskIds = [...new Set(trials.map(t => t.taskId))];
  const paired = taskIds.map(taskId => {
    const first = trials.find(t => t.taskId === taskId)!;
    return { taskId, size: first.size, catalogSize: first.catalogSize, arms: Object.fromEntries(ARMS.map(arm => [arm, summarizeArm(trials.filter(t => t.taskId === taskId && t.arm === arm), labels)])) as Record<Arm, ArmSummary> };
  });
  return { byArm, bySize, paired };
}

// ---------------------------------------------------------------- artifact

export interface ExperimentArtifact {
  schemaVersion: 1; kind: "routing-experiment"; generatedAt: string; command: string; source: "fake" | "live";
  models: { jev: typeof JEV_MODEL; proposer: string };
  routingQuestionSetVersion: typeof ROUTING_QUESTION_SET_VERSION; untrustedDataNote: string;
  policy: RoutingPolicy; runs: number; sizes: SizeTier[];
  catalog: { ids: string[]; tierAvailableIds: Record<SizeTier, string[]> };
  notes: string[];
  /** Evaluation labels, applied only when scoring; never sent to Jev or the proposer. */
  labels: Record<string, ExperimentLabel>;
  trials: Trial[];
  summary: ReturnType<typeof summarizeExperiment>;
}

export const FAKE_NOTES = [
  "FAKE RUN: scripted Jev distributions and a scripted proposer. Not a measurement, not evidence about Jev or any proposer.",
  "Reported usage is null because nothing reported it. Proxy tokens are ceil(UTF-8 bytes / 4) of the arena prompt plus exposed schemas, and of the Jev request body; they are not provider usage or savings.",
  "Latency values are local JS timing of fake adapters, not provider or execution latency.",
];
export const LIVE_NOTES = [
  "LIVE RUN: Jev jev-1.13.0 via the host choice transport; proposer is the Codex CLI arena host with its default model.",
  "Reported usage is what each provider returned; null means unknown, never zero. Proxy tokens are a byte heuristic and exclude the CLI's own system prompt and tool framing.",
  "One run is a signal, not a calibration. Correct-tool labels are synthetic and were fixed before the run.",
  "Jev latency is wall time around the routing call on this host; proposer duration includes CLI start-up.",
];

export function buildArtifact(trials: Trial[], meta: { source: "fake" | "live"; command: string; generatedAt: string; policy: RoutingPolicy; runs: number; sizes: readonly SizeTier[]; proposer: string; labels: Readonly<Record<string, ExperimentLabel>> }): ExperimentArtifact {
  const labels = structuredClone(Object.fromEntries(Object.entries(meta.labels).map(([k, v]) => [k, { acceptableIds: [...v.acceptableIds], expectedOutcome: v.expectedOutcome }])));
  return {
    schemaVersion: 1, kind: "routing-experiment", generatedAt: meta.generatedAt, command: meta.command, source: meta.source,
    models: { jev: JEV_MODEL, proposer: meta.proposer }, routingQuestionSetVersion: ROUTING_QUESTION_SET_VERSION, untrustedDataNote: ROUTING_UNTRUSTED_DATA_NOTE,
    policy: { ...meta.policy }, runs: meta.runs, sizes: [...meta.sizes],
    catalog: { ids: EXPERIMENT_CATALOG.map(t => t.id), tierAvailableIds: Object.fromEntries(SIZE_TIERS.map(s => [s, [...TIER_AVAILABLE_IDS[s]]])) as Record<SizeTier, string[]> },
    notes: meta.source === "fake" ? [...FAKE_NOTES] : [...LIVE_NOTES],
    labels, trials, summary: summarizeExperiment(trials, labels),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const nullableCount = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const OUTCOMES: readonly TrialOutcome[] = ["tool_called", "no_tool_call", "routed_clarification", "routing_unavailable", "proposer_failed"];

/** Validate an artifact read from disk before rendering it. Throws on anything unexpected. */
export function parseExperimentArtifact(raw: unknown): ExperimentArtifact {
  const fail = (why: string): never => { throw Error(`Invalid experiment artifact: ${why}.`); };
  if (!isObj(raw)) fail("not an object");
  const a = raw as Record<string, unknown>;
  if (a.schemaVersion !== EXPERIMENT_SCHEMA_VERSION || a.kind !== "routing-experiment") fail("unsupported schema");
  if (a.source !== "fake" && a.source !== "live") fail("source");
  if (!isObj(a.models) || a.models.jev !== JEV_MODEL) fail("Jev model pin");
  if (typeof a.generatedAt !== "string" || !Number.isFinite(Date.parse(a.generatedAt)) || typeof a.command !== "string") fail("metadata");
  if (!Number.isInteger(a.runs) || !Array.isArray(a.notes) || !a.notes.every(x => typeof x === "string") || !Array.isArray(a.trials) || !isObj(a.labels)) fail("structure");
  if (!Array.isArray(a.sizes) || !a.sizes.every(x => SIZE_TIERS.includes(x as SizeTier)) || !isObj(a.policy) || !Number.isInteger(a.policy.topK) || typeof a.policy.confidenceFloor !== "number") fail("sizes or policy");
  const labels = a.labels as Record<string, unknown>;
  for (const [id, label] of Object.entries(labels)) {
    if (!isObj(label) || !Array.isArray(label.acceptableIds) || !label.acceptableIds.every(x => typeof x === "string") || (label.expectedOutcome !== "selected" && label.expectedOutcome !== "needs_clarification")) fail(`label ${id}`);
  }
  for (const [i, t] of (a.trials as unknown[]).entries()) {
    if (!isObj(t)) fail(`trial ${i}`);
    const trial = t as Record<string, unknown>;
    if (!Number.isInteger(trial.run) || typeof trial.taskId !== "string" || typeof trial.baseId !== "string" || !Object.hasOwn(labels, trial.baseId) || !SIZE_TIERS.includes(trial.size as SizeTier)
      || !ARMS.includes(trial.arm as Arm) || !OUTCOMES.includes(trial.outcome as TrialOutcome) || !Array.isArray(trial.exposedToolIds) || !Number.isInteger(trial.catalogSize)) fail(`trial ${i} fields`);
    if (!isObj(trial.proxies) || ![trial.proxies.proposerInputTokens, trial.proxies.jevRequestTokens, trial.proxies.totalInputTokens].every(v => typeof v === "number" && v >= 0)) fail(`trial ${i} proxies`);
    const proposer = trial.proposer, routing = trial.routing;
    if (proposer !== null && (!isObj(proposer) || !Array.isArray(proposer.calledToolIds) || typeof proposer.traceTruncated !== "boolean" || !isObj(proposer.reported) || ![proposer.reported.input, proposer.reported.cachedInput, proposer.reported.output].every(nullableCount))) fail(`trial ${i} proposer`);
    if (routing !== null && (!isObj(routing) || !Number.isInteger(routing.jevCalls) || !nullableCount(routing.latencyMs) || (routing.reported !== null && (!isObj(routing.reported) || ![routing.reported.input, routing.reported.output].every(nullableCount))))) fail(`trial ${i} routing`);
    if ((trial.arm === "all_tools") !== (routing === null)) fail(`trial ${i} arm/routing mismatch`);
    if ((trial.outcome === "tool_called" || trial.outcome === "no_tool_call" || trial.outcome === "proposer_failed") !== (proposer !== null)) fail(`trial ${i} outcome/proposer mismatch`);
  }
  return raw as unknown as ExperimentArtifact;
}
