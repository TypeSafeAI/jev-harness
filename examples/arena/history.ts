import type { CliResult } from "../host/codex";
import { FIXTURE_HOST_REVISION } from "../host/fixture-tools.mjs";
import { parseFixtureHostRevision, parseFixtureToolCalls } from "../host/fixture-records";
import { parseMeasurement, parseRoutingTransport, routingTransport, type RoutingTransport, type RouterMeasurement } from "../routing/measurement";
import { DEMO_CATALOG } from "../routing/scenarios";
import { HOST_ROUTING_RECOVERY, arenaSetupVersion } from "../routing/host-policy";
import type { RoutingReceipt, RoutingPolicy, ToolDefinition } from "../../src/routing";

export const HISTORY_KEY = "jev-arena-history-v1";
export const MAX_RUNS = 30;
export const MAX_BYTES = 2_000_000;
// Bump when prompt, fixture isolation, catalog or host settings change comparability.
export const ARENA_SETUP_VERSION = arenaSetupVersion(HOST_ROUTING_RECOVERY);
export interface SavedFixture { id: string; title: string; task: string; files: Record<string, string> }
export interface SavedLane { tools: string[]; result: CliResult }
export interface ArenaRun {
  schemaVersion: 1; id: string; startedAt: string; finishedAt: string; setupVersion: number;
  fixtureHostRevision?: typeof FIXTURE_HOST_REVISION;
  routingTransport?: RoutingTransport;
  fixture: SavedFixture; status: "complete" | "partial" | "cancelled" | "failed"; message: string;
  lanes: Partial<Record<"baseline" | "integrated", SavedLane>>;
  receipt: RoutingReceipt | null; jevUsage: RouterMeasurement | null;
}
export type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface HistoryState { runs: ArenaRun[]; error: string | null }
const bytes = (text: string) => new TextEncoder().encode(text).length;
const encode = (runs: readonly ArenaRun[]) => JSON.stringify({ version: 1, runs });
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string") throw Error(); return value; }
function numeric(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw Error(); return value; }
function integer(value: unknown): number { const n = numeric(value); if (!Number.isSafeInteger(n)) throw Error(); return n; }
function nullable(value: unknown): number | null { return value === null ? null : integer(value); }
function duration(value: unknown): number { const n = numeric(value); if (n > 86_400_000) throw Error(); return n; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") throw Error(); return value; }
function literal<T extends string>(value: unknown, options: readonly T[]): T { if (!options.includes(value as T)) throw Error(); return value as T; }
function list<T>(value: unknown, parse: (item: unknown) => T): T[] { if (!Array.isArray(value)) throw Error(); return value.map(parse); }
function date(value: unknown): string { const s = text(value); if (!Number.isFinite(Date.parse(s))) throw Error(); return s; }
function unapplied(value: unknown): false { if (value !== false) throw Error(); return false; }
function schema(value: unknown): ToolDefinition["inputSchema"] {
  const v = record(value); if (v.type !== "object" || v.additionalProperties !== false) throw Error();
  return { type: "object", additionalProperties: false, required: list(v.required, text), properties: Object.fromEntries(Object.entries(record(v.properties)).map(([key, item]) => { const property = record(item); return [key, { type: literal(property.type, ["string", "number", "boolean"]), description: text(property.description) }]; })) };
}
function policy(value: unknown): RoutingPolicy { const v = record(value); return { topK: integer(v.topK), confidenceFloor: numeric(v.confidenceFloor), probabilityFloor: numeric(v.probabilityFloor), relevanceWindow: numeric(v.relevanceWindow), maxCostUnits: numeric(v.maxCostUnits) }; }
function receipt(value: unknown): RoutingReceipt | null {
  if (value === null) return null;
  const v = record(value), request = record(v.request);
  const questionSetVersion = request.questionSetVersion;
  if (v.schemaVersion !== 1 || (questionSetVersion !== 1 && questionSetVersion !== 2 && questionSetVersion !== 3 && questionSetVersion !== 4 && questionSetVersion !== 5)) throw Error();
  const evidence = v.evidence === null ? null : record(v.evidence);
  return {
    schemaVersion: 1,
    catalog: list(v.catalog, item => { const t = record(item); return { id: text(t.id), kind: literal(t.kind, ["tool", "subagent"]), description: text(t.description), estimatedCostUnits: numeric(t.estimatedCostUnits), inputSchema: schema(t.inputSchema) }; }),
    request: { model: literal(request.model, ["jev-1.13.0"]), questionSetVersion, intent: text(request.intent), untrustedDataNote: text(request.untrustedDataNote), options: list(request.options, item => { const o = record(item); return { id: text(o.id), kind: literal(o.kind, ["tool", "subagent", "fallback"]), description: text(o.description) }; }) },
    policy: policy(v.policy), source: literal(v.source, ["mock", "jev"]),
    evidence: evidence ? { model: literal(evidence.model, ["jev-1.13.0"]), choice: text(evidence.choice), confidence: numeric(evidence.confidence), probabilities: Object.fromEntries(Object.entries(record(evidence.probabilities)).map(([key, p]) => [key, numeric(p)])) } : null,
    outcome: literal(v.outcome, ["selected", "needs_clarification", "no_match", "unavailable"]), selectedIds: list(v.selectedIds, text), reason: text(v.reason), execution: { applied: unapplied(record(v.execution).applied) },
  };
}
function lane(value: unknown, files: SavedFixture["files"], revision: typeof FIXTURE_HOST_REVISION | undefined): SavedLane {
  const v = record(value), r = record(v.result);
  return { tools: list(v.tools, text), result: { status: literal(r.status, ["completed", "failed", "cancelled"]), answer: text(r.answer), durationMs: duration(r.durationMs), inputTokens: nullable(r.inputTokens), cachedInputTokens: nullable(r.cachedInputTokens), outputTokens: nullable(r.outputTokens), toolCallCount: integer(r.toolCallCount), traceTruncated: bool(r.traceTruncated), toolCalls: parseFixtureToolCalls(r.toolCalls, files, revision), error: r.error === null ? null : text(r.error) } };
}
function parseRun(value: unknown): ArenaRun {
  const v = record(value), f = record(v.fixture), lanes = record(v.lanes);
  if (v.schemaVersion !== 1) throw Error();
  const id = text(v.id); if (!id || id.length > 100) throw Error();
  const startedAt = date(v.startedAt), finishedAt = date(v.finishedAt);
  if (Date.parse(finishedAt) < Date.parse(startedAt)) throw Error();
  const fixtureHostRevision = parseFixtureHostRevision(v.fixtureHostRevision);
  const files = Object.fromEntries(Object.entries(record(f.files)).map(([key, value]) => [key, text(value)]));
  const routed = receipt(v.receipt);
  const measured = v.jevUsage === null ? null : parseMeasurement(v.jevUsage, routed?.request.options.map(o => o.id) ?? [...DEMO_CATALOG.map(t => t.id), "needs_clarification"], v.status === "cancelled" && routed?.evidence === null ? undefined : routed?.evidence, !routed);
  const transport = v.routingTransport === undefined ? undefined : parseRoutingTransport(v.routingTransport);
  if (transport && v.setupVersion !== arenaSetupVersion(transport.recovery)) throw Error();
  if (transport && measured?.attemptLedger && (transport.recovery !== measured.attemptLedger.recovery || transport.maxAttempts !== measured.attemptLedger.maxAttempts || transport.timeoutMs !== measured.attemptLedger.timeoutMs)) throw Error();
  if (measured?.attemptLedger && v.setupVersion !== arenaSetupVersion(measured.attemptLedger.recovery)) throw Error();
  return { schemaVersion: 1, id, startedAt, finishedAt, setupVersion: integer(v.setupVersion),
    ...(fixtureHostRevision === undefined ? {} : { fixtureHostRevision }),
    ...(transport ? { routingTransport: transport } : {}),
    fixture: { id: text(f.id), title: text(f.title), task: text(f.task), files },
    status: literal(v.status, ["complete", "partial", "cancelled", "failed"]), message: text(v.message),
    lanes: { ...(lanes.baseline ? { baseline: lane(lanes.baseline, files, fixtureHostRevision) } : {}), ...(lanes.integrated ? { integrated: lane(lanes.integrated, files, fixtureHostRevision) } : {}) }, receipt: routed, jevUsage: measured,
  };
}
export function createRun(value: Omit<ArenaRun, "schemaVersion" | "setupVersion" | "fixtureHostRevision">): ArenaRun {
  const ledger = value.jevUsage?.attemptLedger;
  const transport = value.routingTransport ?? routingTransport(ledger?.recovery ?? HOST_ROUTING_RECOVERY, ledger?.timeoutMs);
  return parseRun({ ...value, schemaVersion: 1, setupVersion: arenaSetupVersion(transport.recovery), routingTransport: transport, fixtureHostRevision: FIXTURE_HOST_REVISION });
}
export function retainRuns(runs: readonly ArenaRun[]): ArenaRun[] {
  const unique = [...new Map(runs.map(run => [run.id, run])).values()].sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt)).slice(0, MAX_RUNS);
  while (unique.length && bytes(encode(unique)) > MAX_BYTES) unique.pop();
  return unique;
}
export function parseHistory(raw: string | null): HistoryState {
  if (raw === null) return { runs: [], error: null };
  try {
    if (bytes(raw) > MAX_BYTES) throw Error();
    const v = record(JSON.parse(raw)); if (v.version !== 1 || !Array.isArray(v.runs) || v.runs.length > MAX_RUNS) throw Error();
    const runs: ArenaRun[] = []; let invalid = false;
    for (const item of v.runs) { try { runs.push(parseRun(item)); } catch { invalid = true; } }
    return { runs: retainRuns(runs), error: invalid ? "Some saved runs could not be read and were left out." : null };
  } catch { return { runs: [], error: "Local history could not be read. Clear it to start fresh, or download the current run." }; }
}
export function readHistory(storage: HistoryStorage): HistoryState { try { return parseHistory(storage.getItem(HISTORY_KEY)); } catch { return { runs: [], error: "Browser storage is unavailable. Current results still work; download them to keep a copy." }; } }
export function saveRun(storage: HistoryStorage, run: ArenaRun): HistoryState & { saved: boolean } {
  const previous = readHistory(storage);
  if (previous.error) return { ...previous, saved: false, error: `${previous.error} Clear local history before saving new runs; download the current run to keep it.` };
  try {
    const clean = parseRun(run);
    if (bytes(encode([clean])) > MAX_BYTES) return { ...previous, saved: false, error: "This run is too large for local history. Download it to keep the full result." };
    const runs = retainRuns([clean, ...previous.runs.filter(item => item.id !== clean.id)]);
    if (!runs.some(item => item.id === clean.id)) return { ...previous, saved: false, error: "This run falls outside the retained history. Download it to keep its evidence." };
    storage.setItem(HISTORY_KEY, encode(runs));
    return { runs, saved: true, error: null };
  } catch { return { ...previous, saved: false, error: "This run could not be saved locally. Download it to keep a copy; existing history was preserved." }; }
}
export function clearHistory(storage: HistoryStorage): string | null { try { storage.removeItem(HISTORY_KEY); return null; } catch { return "Local history could not be cleared. Check browser storage permissions."; } }
export type PerformanceMetric = "input" | "duration";
export function runMetrics(run: ArenaRun, metric: PerformanceMetric) {
  const base = run.lanes.baseline?.result, integrated = run.lanes.integrated?.result;
  if (metric === "duration") return { baseline: base?.durationMs ?? null, integrated: integrated && run.jevUsage?.latencyMs != null ? integrated.durationMs + run.jevUsage.latencyMs : null };
  return { baseline: base?.inputTokens ?? null, integrated: integrated?.inputTokens != null && run.jevUsage?.inputTokens != null ? integrated.inputTokens + run.jevUsage.inputTokens : null };
}
function sameFixture(a: SavedFixture, b: SavedFixture) { return a.id === b.id && a.task === b.task && JSON.stringify(Object.entries(a.files).sort()) === JSON.stringify(Object.entries(b.files).sort()); }
export function performanceSeries(runs: readonly ArenaRun[], fixture: SavedFixture, metric: PerformanceMetric, setupVersion = ARENA_SETUP_VERSION, transport = routingTransport(setupVersion === 7 ? "probability_sum_only_v1" : "none")) {
  const related = runs.filter(run => run.fixture.id === fixture.id);
  const points = related.flatMap(run => {
    const values = runMetrics(run, metric);
    const config = run.routingTransport ?? routingTransport();
    const sameTransport = config.recovery === transport.recovery && config.maxAttempts === transport.maxAttempts && config.timeoutMs === transport.timeoutMs;
    return sameTransport && sameFixture(run.fixture, fixture) && run.setupVersion === setupVersion && run.status === "complete" && run.lanes.baseline?.result.status === "completed" && run.lanes.integrated?.result.status === "completed" && values.baseline !== null && values.integrated !== null && Number.isFinite(values.baseline) && Number.isFinite(values.integrated) ? [{ run, baseline: values.baseline, integrated: values.integrated }] : [];
  }).sort((a, b) => Date.parse(a.run.finishedAt) - Date.parse(b.run.finishedAt));
  return { points, excluded: related.length - points.length };
}
