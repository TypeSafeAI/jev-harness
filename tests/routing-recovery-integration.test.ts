import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveHandler } from "../examples/host/live.js";
import { createJevChoiceRouter } from "../examples/host/jev-choice.js";
import { parseCliArgs } from "../examples/routing/experiment-cli.js";
import { buildArtifact, runExperiment, fakeProposer, parseExperimentArtifact, summarizeExperiment } from "../examples/routing/experiment.js";
import { EXPERIMENT_LABELS } from "../examples/routing/experiment-tasks.js";
import { DEMO_POLICY, DEMO_CATALOG } from "../examples/routing/scenarios.js";
import { routeTools } from "../src/routing/index.js";
import { routingTransport } from "../examples/routing/measurement.js";
import { createRun, parseHistory, performanceSeries } from "../examples/arena/history.js";
import { ARENA_CASES } from "../examples/arena/cases.js";
import { parseEntries, summarizeUsage } from "../examples/routing/usage.js";

const base = "http://127.0.0.1:4173";
const input = { intent: "Read the synthetic file", availableIds: ["read_file"] };
function fakeResponse(body: unknown, malformed = false) {
  const ids = Object.keys(JSON.parse(String(body)).questions.tool.criteria);
  return Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: ids[0], confidence: .9, probabilities: Object.fromEntries(ids.map((id, index) => [id, index === 0 ? .9 : (malformed ? .09 : .1) / (ids.length - 1)])) } }, usage: { input_tokens: 100, output_tokens: 10 } });
}

test("live handler admits at most thirty physical requests including recovery", async () => {
  let calls = 0;
  const handler = createLiveHandler({ serverKey: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async (_url, init) => { calls++; return fakeResponse(init?.body, true); } });
  const send = () => handler(new Request(base + "/api/route", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify(input) }));
  for (let i = 0; i < 10; i++) {
    const body = await (await send()).json();
    assert.equal(body.measurement.attemptLedger.attempts.length, 3);
    assert.equal(body.measurement.inputTokens, 300);
  }
  const denied = await send(); assert.equal(denied.status, 429); assert.equal(calls, 30);
});

test("sum recovery requires explicit live CLI option and is rejected in table mode", () => {
  assert.equal(parseCliArgs(["--live", "--sum-recovery"]).sumRecovery, true);
  assert.throws(() => parseCliArgs(["--sum-recovery"]), /requires --live/);
  assert.throws(() => parseCliArgs(["--table", "saved.json", "--sum-recovery"]), /only renders/);
});

test("versioned live artifacts retain physical attempts, proxies and replay validation", async () => {
  const config = routingTransport("probability_sum_only_v1");
  const trials = await runExperiment({ runs: 1, sizes: ["small"], policy: DEMO_POLICY }, { source: "live", routingTransport: config, proposer: fakeProposer, routerFor: () => {
    let calls = 0;
    const h = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: config.recovery, fetch: async (_url, init) => fakeResponse(init?.body, ++calls === 1) });
    return { router: h.router, measurement: () => h.state.measurement };
  } });
  const artifact = buildArtifact(trials, { source: "live", routingTransport: config, command: "synthetic test", generatedAt: "2026-09-26T00:00:00Z", policy: DEMO_POLICY, runs: 1, sizes: ["small"], proposer: "fake", labels: EXPERIMENT_LABELS });
  for (const t of trials.filter(t => t.routing)) {
    assert.equal(t.routing!.jevCalls, 1); assert.equal(t.routing!.providerRequests, 2);
    assert.equal(t.routing!.reported?.input, 200); assert.equal(t.routing!.attemptLedger?.attempts.length, 2);
    assert.equal(t.proxies.jevPhysicalRequestTokens, t.proxies.jevRequestTokens * 2);
    assert.equal(t.proxies.totalInputTokens, t.proxies.proposerInputTokens + t.proxies.jevPhysicalRequestTokens!);
  }
  assert.equal(summarizeExperiment(trials, EXPERIMENT_LABELS).byArm.jev_top_k.providerRequests, 10);
  assert.deepEqual(await parseExperimentArtifact(artifact), artifact);
  for (const mutate of [
    (a: typeof artifact) => { a.trials.find(t => t.routing)!.routing!.providerRequests = 1; },
    (a: typeof artifact) => { a.trials.find(t => t.routing)!.routing!.reported!.input = 100; },
    (a: typeof artifact) => { a.routingTransport!.recovery = "none"; },
    (a: typeof artifact) => { a.trials.find(t => t.routing)!.proxies.jevPhysicalRequestTokens = 1; },
  ]) { const changed = structuredClone(artifact); mutate(changed); await assert.rejects(parseExperimentArtifact(changed)); }
});

test("history and session usage preserve full ledger, with separate recovery cohort", async () => {
  let calls = 0;
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async (_url, init) => fakeResponse(init?.body, ++calls === 1) });
  const receipt = await routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router);
  const run = createRun({ id: "recovered", startedAt: "2026-09-26T00:00:00Z", finishedAt: "2026-09-26T00:00:01Z", fixture: ARENA_CASES[0], status: "failed", message: "Synthetic", lanes: {}, receipt, jevUsage: handle.state.measurement });
  assert.equal(run.setupVersion, 7);
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [run] })).runs, [run]);
  const entry = { at: run.finishedAt, status: "success", input: 200, output: 20, latencyMs: handle.state.measurement!.latencyMs, keySource: "host", measurement: handle.state.measurement };
  const parsed = parseEntries(JSON.stringify([entry])); assert.deepEqual(parsed, [entry]);
  const summary = summarizeUsage(parsed); assert.equal(summary.providerRequests, 2); assert.equal(summary.observedProviderRequests, 2);
  const legacy = parseEntries(JSON.stringify([{ ...entry, measurement: undefined }]));
  assert.equal(summarizeUsage(legacy).providerRequests, null, "legacy scalars do not invent a request ledger");
});

test("usage inspection includes recovery when routing failed before any CLI result", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ArenaAccounting } = await import("../components/arena-results.js");
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async (_url, init) => fakeResponse(init?.body, true) });
  await routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router);
  const html = renderToStaticMarkup(createElement(ArenaAccounting, { lanes: {}, jevUsage: handle.state.measurement }));
  assert.match(html, /Physical requests/); assert.match(html, /Additional requests/);
  assert.match(html, /Invalid probability total/); assert.match(html, /300/); assert.match(html, /Attempt limit reached/);
});

test("internal live observer delivers partial ledgers without changing host result", async () => {
  let calls = 0;
  const snapshots: unknown[] = [];
  const handler = createLiveHandler({ serverKey: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async (_url, init) => fakeResponse(init?.body, ++calls === 1) });
  const response = await handler(new Request(base + "/api/route", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify(input) }), measurement => snapshots.push(measurement));
  const { parseMeasurement, attemptTotals } = await import("../examples/routing/measurement.js");
  const partial = snapshots.map(value => parseMeasurement(value)).find(m => m.attemptLedger?.attempts.length === 2 && !m.attemptLedger.complete)!;
  assert.ok(partial); assert.equal(partial.inputTokens, null); assert.equal(partial.latencyMs, null);
  assert.equal(attemptTotals(partial.attemptLedger!).providerRequests, null);
  assert.equal(attemptTotals(partial.attemptLedger!).observedProviderRequests, 2);
  assert.equal((await response.json()).evidence.choice, "read_file");
});

test("history transport marker separates timeout configuration and keeps interrupted usage unknown", async () => {
  const snapshots: import("../examples/routing/measurement.js").RouterMeasurement[] = [];
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", onMeasurement: m => snapshots.push(m), fetch: async (_url, init) => fakeResponse(init?.body) });
  const receipt = await routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router);
  const result = { status: "completed" as const, answer: "Synthetic", durationMs: 100, inputTokens: 10, cachedInputTokens: 0, outputTokens: 1, toolCallCount: 0, traceTruncated: false, toolCalls: [], error: null };
  const value = { id: "config", startedAt: "2026-09-26T00:00:00Z", finishedAt: "2026-09-26T00:00:01Z", fixture: ARENA_CASES[0], status: "complete" as const, message: "Synthetic", lanes: { baseline: { tools: ["read_file"], result }, integrated: { tools: ["read_file"], result } }, receipt, jevUsage: handle.state.measurement };
  const full = createRun(value);
  assert.deepEqual(full.routingTransport, routingTransport("probability_sum_only_v1"));
  assert.equal(performanceSeries([full], ARENA_CASES[0], "input", 6).points.length, 0);
  assert.equal(performanceSeries([full], ARENA_CASES[0], "input", 7).points.length, 1);
  const changed = structuredClone(full); changed.routingTransport!.timeoutMs = 40_000; changed.jevUsage!.attemptLedger!.timeoutMs = 40_000;
  assert.equal(performanceSeries([changed], ARENA_CASES[0], "input", 7).points.length, 0);
  const partial = createRun({ ...value, receipt: null, status: "cancelled", jevUsage: snapshots.find(m => m.attemptLedger?.attempts.length === 1 && !m.attemptLedger.complete)! });
  assert.equal(partial.jevUsage?.inputTokens, null); assert.equal(partial.setupVersion, 7);
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [partial] })).runs, [partial]);
  const { analyzeRun } = await import("../examples/arena/lessons.js");
  assert.equal(analyzeRun(partial).measurements.input.delta, null);
});

test("cancellation after a valid adapter result preserves its ledger without inventing receipt evidence", async () => {
  const controller = new AbortController();
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", signal: controller.signal,
    onMeasurement: m => { if (m.attemptLedger?.complete) controller.abort(); }, fetch: async (_url, init) => fakeResponse(init?.body) });
  const receipt = await routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router, controller.signal);
  assert.equal(receipt.outcome, "unavailable"); assert.equal(receipt.evidence, null);
  assert.equal(handle.state.measurement?.attemptLedger?.stopReason, "valid");
  const cancelled = createRun({ id: "cancelled-valid", startedAt: "2026-09-26T00:00:00Z", finishedAt: "2026-09-26T00:00:01Z", fixture: ARENA_CASES[0], status: "cancelled", message: "Synthetic", lanes: {}, receipt, jevUsage: handle.state.measurement });
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [cancelled] })).runs, [cancelled]);
});

test("candidate demo enables recovery while the reusable adapter remains single request", async () => {
  const { HOST_ROUTING_RECOVERY } = await import("../examples/routing/host-policy.js");
  assert.equal(HOST_ROUTING_RECOVERY, "probability_sum_only_v1");
  let calls = 0;
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async (_url, init) => { calls++; return fakeResponse(init?.body, true); } });
  await routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router);
  assert.equal(calls, 1); assert.equal(handle.state.measurement?.attemptLedger?.recovery, "none");
});

test("attempt inspection uses labeled cards instead of a squeezed nested table", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { RoutingAttempts } = await import("../components/routing-attempts.js");
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async (_url, init) => fakeResponse(init?.body, true) });
  await routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router);
  const html = renderToStaticMarkup(createElement(RoutingAttempts, { measurement: handle.state.measurement }));
  assert.match(html, /<ol class="routing-attempt-list"/);
  assert.match(html, /<dt>Input tokens<\/dt>/); assert.match(html, /<dt>Output tokens<\/dt>/);
  assert.match(html, /Probability total.*0.99/);
  assert.doesNotMatch(html, /<table/);
});
