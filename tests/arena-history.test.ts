import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA_CASES } from "../examples/arena/cases";
import { ARENA_SETUP_VERSION, createRun, parseHistory, retainRuns, saveRun, readHistory, clearHistory, performanceSeries, type ArenaRun, HISTORY_KEY, MAX_RUNS, MAX_BYTES } from "../examples/arena/history";
import { routeTools } from "../src/routing";
import * as demo from "../examples/routing/scenarios";

const { DEMO_CATALOG, DEMO_POLICY, SCENARIOS, scenarioRouter } = demo;

const fixture = ARENA_CASES[0];
const lane = { tools: ["read_file"], result: { status: "completed" as const, answer: "The result is 5.", durationMs: 1000, inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null } };
function run(id = "one"): ArenaRun {
  return createRun({ id, startedAt: "2026-09-22T00:00:00Z", finishedAt: "2026-09-22T00:00:02Z", fixture, status: "complete", message: "Comparison finished.", lanes: { baseline: lane, integrated: lane }, receipt: null, jevUsage: { inputTokens: 20, outputTokens: 2, latencyMs: 200, requestBytes: 200, responseBytes: 20 } });
}
class Storage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

test("local snapshots round-trip evidence and exclude fields outside their schema", () => {
  const entry = run();
  const parsed = parseHistory(JSON.stringify({ version: 1, runs: [{ ...entry, credential: "synthetic-extra-field" }] }));
  assert.deepEqual(parsed.runs, [entry]);
  assert.equal(JSON.stringify(parsed).includes("synthetic-extra-field"), false);
  assert.equal(parsed.error, null);
});

test("history preserves v1/v2/v3/v4/v5 receipts while setup 7 excludes older and single-request control cohorts", async () => {
  assert.equal(ARENA_SETUP_VERSION, 7);
  const current = run("current");
  assert.equal(current.setupVersion, 7);
  current.receipt = await routeTools(DEMO_CATALOG, { intent: fixture.task, availableIds: DEMO_CATALOG.map(t => t.id) }, DEMO_POLICY, scenarioRouter(SCENARIOS[0]!));
  const oldReceipt = await routeTools(demo.DEMO_CATALOG_V1, { intent: fixture.task, availableIds: demo.DEMO_CATALOG_V1.map(t => t.id) }, DEMO_POLICY, scenarioRouter(SCENARIOS[0]!));
  const old = { ...run("v1"), setupVersion: 2, receipt: { ...oldReceipt, request: { ...oldReceipt.request, questionSetVersion: 1 as const } } };
  const v2 = { ...run("v2"), setupVersion: 3, receipt: { ...current.receipt, request: { ...current.receipt.request, questionSetVersion: 2 as const } } };
  const v3 = { ...run("v3"), setupVersion: 4, receipt: { ...current.receipt, request: { ...current.receipt.request, questionSetVersion: 3 as const } } };
  const v4 = { ...run("v4"), setupVersion: 5, receipt: { ...current.receipt, request: { ...current.receipt.request, questionSetVersion: 4 as const } } };
  // Historical snapshots predate transport markers; newly produced runs carry one.
  for (const historical of [old, v2, v3, v4]) delete historical.routingTransport;
  const control = { ...run("control"), setupVersion: 6, routingTransport: { version: 1 as const, recovery: "none" as const, maxAttempts: 1 as const, timeoutMs: 45_000 }, receipt: current.receipt };
  const runs = [old, v2, v3, v4, control, current];
  const before = JSON.stringify(runs);
  const parsed = parseHistory(JSON.stringify({ version: 1, runs }));
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.runs, runs);
  assert.equal(JSON.stringify(runs), before);
  assert.deepEqual(parsed.runs.map(r => r.receipt?.request.questionSetVersion), [1, 2, 3, 4, 5, 5]);
  const series = performanceSeries(parsed.runs, fixture, "input");
  assert.deepEqual(series.points.map(point => point.run.id), ["current"]);
  assert.equal(series.excluded, 5);
  assert.deepEqual(performanceSeries(parsed.runs, fixture, "input", 6).points.map(point => point.run.id), ["control"]);
  for (const version of [0, 6, "1", null]) {
    const invalid = { ...current, receipt: { ...current.receipt, request: { ...current.receipt.request, questionSetVersion: version } } };
    const result = parseHistory(JSON.stringify({ version: 1, runs: [invalid] }));
    assert.deepEqual(result.runs, []);
    assert.ok(result.error);
  }
});

test("invalid, future and malformed local data do not become results", () => {
  for (const raw of ["broken", JSON.stringify({ version: 2, runs: [run()] }), JSON.stringify({ version: 1, runs: [{ ...run(), lanes: { baseline: { ...lane, result: { ...lane.result, inputTokens: -1 } } } }] })]) {
    const result = parseHistory(raw);
    assert.equal(result.runs.length, 0);
    assert.ok(result.error);
  }
  assert.deepEqual(parseHistory(null), { runs: [], error: null });
});

test("history preserves zero, unknown, partial outcomes and complete answer text", () => {
  const entry = run();
  entry.lanes.integrated!.result = { ...lane.result, status: "cancelled", inputTokens: null, answer: "a".repeat(20000), toolCallCount: 0, toolCalls: [] };
  entry.status = "cancelled";
  const result = parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs[0]!;
  assert.equal(result.lanes.integrated!.result.inputTokens, null);
  assert.equal(result.lanes.integrated!.result.toolCallCount, 0);
  assert.equal(result.lanes.integrated!.result.answer.length, 20000);
  assert.equal(result.status, "cancelled");
});

test("retention deduplicates and bounds both count and serialized storage", () => {
  const entries = Array.from({ length: MAX_RUNS + 5 }, (_, i) => ({ ...run(String(i)), finishedAt: new Date(Date.UTC(2026, 8, 22, 0, i)).toISOString() }));
  const kept = retainRuns([entries[0]!, ...entries]);
  assert.equal(kept.length, MAX_RUNS);
  assert.equal(new Set(kept.map(entry => entry.id)).size, MAX_RUNS);
  assert.equal(kept[0]!.id, String(MAX_RUNS + 4));
  for (const entry of entries) entry.lanes.baseline!.result.answer = "測".repeat(30000);
  assert.ok(new TextEncoder().encode(JSON.stringify({ version: 1, runs: retainRuns(entries) })).length <= MAX_BYTES);
});

test("save merges existing runs, survives reload and clears only history", () => {
  const storage = new Storage(); storage.setItem("unrelated", "retained");
  assert.equal(saveRun(storage, run()).saved, true);
  assert.equal(saveRun(storage, run("two")).saved, true);
  assert.equal(saveRun(storage, run("two")).runs.length, 2);
  assert.equal(readHistory(storage).runs.length, 2);
  assert.equal(clearHistory(storage), null);
  assert.equal(storage.getItem(HISTORY_KEY), null);
  assert.equal(storage.getItem("unrelated"), "retained");
});

test("quota and unavailable storage are visible without destroying the previous cache", () => {
  const storage = new Storage(); saveRun(storage, run());
  const prior = storage.getItem(HISTORY_KEY);
  storage.setItem = () => { throw Error("quota"); };
  const result = saveRun(storage, run("two"));
  assert.equal(result.saved, false);
  assert.ok(result.error);
  assert.equal(storage.getItem(HISTORY_KEY), prior);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.ok(readHistory(blocked).error);
  assert.ok(clearHistory(blocked));
});

test("oversized runs are not silently truncated or called saved", () => {
  const entry = run(); entry.lanes.baseline!.result.answer = "x".repeat(MAX_BYTES + 1);
  const storage = new Storage();
  const result = saveRun(storage, entry);
  assert.equal(result.saved, false);
  assert.ok(result.error);
  assert.equal(storage.getItem(HISTORY_KEY), null);
});

test("time series uses complete same-fixture same-setup pairs and includes Jev overhead", () => {
  const first = run(), later = { ...run("later"), finishedAt: "2026-09-22T00:10:00Z" };
  const unknown = run("unknown"); unknown.jevUsage = null;
  const partial = run("partial"); partial.status = "partial";
  const different = run("different"); different.fixture = { ...fixture, task: "Changed task" };
  const oldSetup = run("old"); oldSetup.setupVersion = 0;
  const series = performanceSeries([later, first, unknown, partial, different, oldSetup], fixture, "input");
  assert.deepEqual(series.points.map(point => [point.run.id, point.baseline, point.integrated]), [["one", 100, 120], ["later", 100, 120]]);
  assert.equal(series.excluded, 4);
  assert.equal(performanceSeries([first], fixture, "duration").points[0]!.integrated, 1200);
  assert.equal(performanceSeries([first], fixture, "input").points[0]!.baseline, 100);
});

test("corrupt measurement counts and durations never enter a trend", () => {
  for (const value of [1e308, .5, -1]) {
    const entry = run(); entry.lanes.baseline!.result.inputTokens = value;
    assert.equal(parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs.length, 0);
  }
  const entry = run(); entry.jevUsage!.latencyMs = 1e308;
  assert.equal(parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs.length, 0);
  entry.lanes.integrated!.result.durationMs = 1e308;
  assert.equal(performanceSeries([entry], fixture, "duration").points.length, 0);
});

test("unreadable history is preserved until the user explicitly clears it", () => {
  const storage = new Storage(); const raw = JSON.stringify({ version: 999, runs: [run()] });
  storage.setItem(HISTORY_KEY, raw);
  assert.equal(saveRun(storage, run("new")).saved, false);
  assert.equal(storage.getItem(HISTORY_KEY), raw);
});

test("a run excluded by retention is not reported as saved", () => {
  const storage = new Storage();
  const entries = Array.from({ length: MAX_RUNS }, (_, i) => ({ ...run(String(i)), finishedAt: new Date(Date.UTC(2026, 8, 23, 0, i)).toISOString() }));
  storage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, runs: entries }));
  assert.equal(saveRun(storage, run("older")).saved, false);
  assert.equal(readHistory(storage).runs.length, MAX_RUNS);
});
