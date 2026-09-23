import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "../src/index.js";
import * as routing from "../src/routing/index.js";

const catalog: api.ToolDefinition[] = [
  { id: "read", kind: "tool", description: "Read a synthetic file", estimatedCostUnits: 1,
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Synthetic path" } }, required: ["path"], additionalProperties: false } },
  { id: "inspect", kind: "subagent", description: "Inspect a synthetic file", estimatedCostUnits: 8,
    inputSchema: { type: "object", properties: { task: { type: "string", description: "Synthetic task" } }, required: ["task"], additionalProperties: false } },
];
const input: api.RoutingInput = { intent: "Read the synthetic example", availableIds: ["read", "inspect"] };
const policy: api.RoutingPolicy = { topK: 1, confidenceFloor: 0.7, probabilityFloor: 0.2, relevanceWindow: 0.1, maxCostUnits: 10 };
const evidence: api.RoutingEvidence = { model: "jev-1.13.0", choice: "inspect", confidence: 0.9,
  probabilities: { read: 0.46, inspect: 0.5, needs_clarification: 0.04 } };
const router = (value: unknown = evidence): api.ToolRouter => ({ source: "mock", review: async () => value });

test("context preparation is exported from the public root and routing entry points", () => {
  assert.equal(typeof api.prepareToolContext, "function");
  assert.equal(api.prepareToolContext, routing.prepareToolContext);
});

test("explicit shadow and lean modes expose the requested context with one review", async () => {
  for (const mode of ["shadow", "lean"] as const) {
    let calls = 0;
    const result = await api.prepareToolContext({ catalog, input, policy, mode,
      router: { source: "mock", review: async request => { calls++; assert.equal(request.intent, input.intent); return evidence; } } });
    assert.equal(calls, 1);
    assert.equal(result.mode, mode);
    assert.equal(result.receipt.outcome, "selected");
    assert.equal(result.receipt.execution.applied, false);
    assert.deepEqual(result.full.state.loadedIds, ["read", "inspect"]);
    assert.deepEqual(result.lean.state.loadedIds, ["read"]);
    assert.equal(result.context, mode === "shadow" ? result.full : result.lean);
    assert.deepEqual(JSON.parse(result.context.serialized).tools.map((tool: { id: string }) => tool.id),
      mode === "shadow" ? ["read", "inspect"] : ["read"]);
  }
});

test("non-selected routing outcomes keep shadow explicit and lean empty", async () => {
  const cases: { router: api.ToolRouter; policy?: api.RoutingPolicy; outcome: api.RoutingReceipt["outcome"] }[] = [
    { router: router(null), outcome: "unavailable" },
    { router: { source: "mock", review: async () => { throw Error("synthetic private adapter detail"); } }, outcome: "unavailable" },
    { router: router({ ...evidence, choice: "needs_clarification", probabilities: { read: 0.05, inspect: 0.05, needs_clarification: 0.9 } }), outcome: "needs_clarification" },
    { router: router({ ...evidence, confidence: 0.1 }), outcome: "needs_clarification" },
    { router: router(), policy: { ...policy, maxCostUnits: 0 }, outcome: "no_match" },
  ];
  for (const scenario of cases) for (const mode of ["shadow", "lean"] as const) {
    const result = await api.prepareToolContext({ catalog, input, policy: scenario.policy ?? policy,
      router: scenario.router, mode, previous: { loadedIds: ["read"] } });
    assert.equal(result.receipt.outcome, scenario.outcome);
    assert.deepEqual(result.receipt.selectedIds, []);
    assert.deepEqual(result.full.state.loadedIds, ["read", "inspect"]);
    assert.deepEqual(result.lean.state.loadedIds, []);
    assert.deepEqual(result.lean.evictedIds, ["read"]);
    assert.equal(result.context, mode === "shadow" ? result.full : result.lean);
    assert.equal(JSON.stringify(result).includes("synthetic private adapter detail"), false);
  }
});

test("no available descriptors makes no review call and evicts previous context", async () => {
  let calls = 0;
  const result = await api.prepareToolContext({ catalog, input: { ...input, availableIds: [] }, policy, mode: "shadow",
    previous: { loadedIds: ["read", "inspect"] }, router: { source: "mock", review: async () => { calls++; return evidence; } } });
  assert.equal(calls, 0);
  assert.equal(result.receipt.outcome, "no_match");
  assert.deepEqual(result.context.state.loadedIds, []);
  assert.deepEqual(result.context.evictedIds, ["read", "inspect"]);
});

test("unknown and omitted modes fail before calling the router", async () => {
  let calls = 0;
  for (const mode of ["full", "invalid", undefined]) {
    await assert.rejects(api.prepareToolContext({ catalog, input, policy, mode: mode as api.ToolContextMode,
      router: { source: "mock", review: async () => { calls++; return evidence; } } }), /mode/i);
  }
  assert.equal(calls, 0);
});

test("pre-abort exposes no active context in either mode and preserves the full comparison", async () => {
  for (const mode of ["shadow", "lean"] as const) {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await api.prepareToolContext({ catalog, input, policy, mode, signal: controller.signal,
      previous: { loadedIds: ["read", "inspect"] }, router: { source: "mock", review: async () => { calls++; return evidence; } } });
    assert.equal(calls, 0);
    assert.equal(result.mode, mode);
    assert.equal(result.receipt.outcome, "unavailable");
    assert.deepEqual(result.full.state.loadedIds, ["read", "inspect"]);
    assert.deepEqual(result.context.state.loadedIds, []);
    assert.deepEqual(result.context.evictedIds, ["read", "inspect"]);
    assert.deepEqual(JSON.parse(result.context.serialized).tools, []);
  }
});

test("abort while reviewing clears active context even when the adapter resolves or rejects", async () => {
  for (const mode of ["shadow", "lean"] as const) for (const reject of [false, true]) {
    const controller = new AbortController();
    let finish!: (value: unknown) => void;
    let fail!: (reason: unknown) => void;
    const review = new Promise<unknown>((resolve, rejection) => { finish = resolve; fail = rejection; });
    const pending = api.prepareToolContext({ catalog, input, policy, mode, signal: controller.signal,
      previous: { loadedIds: ["read"] }, router: { source: "mock", review: async (_request, signal) => {
        assert.equal(signal, controller.signal); return review;
      } } });
    controller.abort();
    if (reject) fail(Error("synthetic cancellation")); else finish(evidence);
    const result = await pending;
    assert.equal(result.receipt.outcome, "unavailable");
    assert.deepEqual(result.context.state.loadedIds, []);
    assert.deepEqual(result.context.evictedIds, ["read"]);
    assert.deepEqual(result.full.state.loadedIds, ["read", "inspect"]);
  }
});

test("caller mutations while awaiting do not change mode, previous state or routing snapshots", async () => {
  let finish!: (value: unknown) => void;
  const review = new Promise<unknown>(resolve => { finish = resolve; });
  const mutable: api.PrepareToolContextOptions = { catalog: structuredClone(catalog), input: structuredClone(input),
    policy: { ...policy }, router: { source: "mock", review: async () => review }, mode: "lean", previous: { loadedIds: ["inspect"] } };
  const originalPrevious = mutable.previous!;
  const pending = api.prepareToolContext(mutable);
  mutable.mode = "shadow";
  mutable.previous = { loadedIds: [] };
  (originalPrevious.loadedIds as string[]).push("read");
  mutable.catalog[0]!.description = "Changed description";
  mutable.catalog[0]!.inputSchema.properties.path!.description = "Changed schema";
  mutable.input.intent = "Changed task";
  (mutable.input.availableIds as string[]).length = 0;
  mutable.policy.maxCostUnits = 0;
  finish(evidence);
  const result = await pending;
  assert.equal(result.mode, "lean");
  assert.equal(result.context, result.lean);
  assert.equal(result.receipt.request.intent, input.intent);
  assert.equal(result.receipt.policy.maxCostUnits, policy.maxCostUnits);
  assert.equal(result.context.tools[0]!.description, catalog[0]!.description);
  assert.equal(result.context.tools[0]!.inputSchema.properties.path!.description, "Synthetic path");
  assert.deepEqual(result.context.addedIds, ["read"]);
  assert.deepEqual(result.context.evictedIds, ["inspect"]);
  assert.deepEqual(result.full.addedIds, ["read"]);
  assert.deepEqual(result.full.evictedIds, []);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.context.state.loadedIds));
  assert.ok(Object.isFrozen(result.context.tools[0]!.inputSchema.properties));
  assert.throws(() => { result.context.tools[0]!.description = "Changed result"; });
});

test("cancellation between routing and context handoff clears an already selected context", async () => {
  for (const mode of ["shadow", "lean"] as const) {
    const controller = new AbortController();
    const pending = api.prepareToolContext({ catalog, input, policy, mode, signal: controller.signal,
      previous: { loadedIds: ["read"] }, router: { source: "mock", review: () => Promise.resolve(evidence) } });
    queueMicrotask(() => controller.abort());
    const result = await pending;
    assert.equal(result.receipt.outcome, "selected");
    assert.deepEqual(result.lean.state.loadedIds, ["read"]);
    assert.deepEqual(result.context.state.loadedIds, []);
    assert.deepEqual(result.context.evictedIds, ["read"]);
  }
});

test("switching modes reloads evicted descriptors from the current availability snapshot", async () => {
  const lean = await api.prepareToolContext({ catalog, input, policy, router: router(), mode: "lean" });
  const shadow = await api.prepareToolContext({ catalog, input, policy, router: router(), mode: "shadow", previous: lean.context.state });
  assert.deepEqual(shadow.context.addedIds, ["inspect"]);
  assert.deepEqual(shadow.context.evictedIds, []);
  const reduced = await api.prepareToolContext({ catalog, input: { ...input, availableIds: ["read"] }, policy,
    router: router({ ...evidence, choice: "read", probabilities: { read: 0.9, needs_clarification: 0.1 } }), mode: "shadow", previous: shadow.context.state });
  assert.deepEqual(reduced.context.state.loadedIds, ["read"]);
  assert.deepEqual(reduced.context.evictedIds, ["inspect"]);
});

test("offline host example records synthetic observations for both modes without handlers", async () => {
  const { runIntegrationDemo } = await import("../examples/integration/host.js");
  const demo = await runIntegrationDemo();
  assert.equal(demo.source, "synthetic");
  assert.equal(demo.execution.applied, false);
  assert.deepEqual(new Set(demo.observations.map(observation => observation.mode)), new Set(["shadow", "lean"]));
  for (const mode of ["shadow", "lean"] as const) {
    const observations = demo.observations.filter(observation => observation.mode === mode);
    assert.deepEqual(new Set(observations.map(observation => observation.outcome)), new Set(["selected", "needs_clarification", "no_match", "unavailable"]));
    const selected = observations.find(observation => observation.outcome === "selected")!;
    assert.ok(selected.exposedIds.length > 0);
    assert.deepEqual(selected.selectedIds, ["read"]);
    for (const observation of observations) {
      assert.equal(observation.receipt.source, "mock");
      assert.equal(observation.receipt.execution.applied, false);
      assert.ok(Array.isArray(observation.addedIds));
      assert.ok(Array.isArray(observation.evictedIds));
      if (mode === "lean" && observation.outcome !== "selected") assert.deepEqual(observation.exposedIds, []);
    }
  }
});

test("offline host refreshes availability and reloads a returning specialist in both modes", async () => {
  const { runIntegrationDemo } = await import("../examples/integration/host.js");
  const demo = await runIntegrationDemo();
  for (const mode of ["shadow", "lean"] as const) {
    const observations = demo.observations.filter(observation => observation.mode === mode);
    const before = observations.find(observation => observation.scenario === "inspect");
    const removed = observations.find(observation => observation.scenario === "inspect_removed");
    const restored = observations.find(observation => observation.scenario === "inspect_restored");
    assert.ok(before, "prepare the specialist before changing availability");
    assert.ok(removed, "demonstrate a fresh snapshot without the specialist");
    assert.ok(restored, "demonstrate the specialist becoming available again");
    assert.deepEqual(before.selectedIds, ["inspect"]);
    assert.deepEqual(before.exposedIds, mode === "shadow" ? ["read", "inspect"] : ["inspect"]);
    assert.equal(removed.outcome, "selected");
    assert.deepEqual(removed.exposedIds, ["read"]);
    assert.deepEqual(removed.selectedIds, ["read"]);
    assert.deepEqual(removed.evictedIds, ["inspect"]);
    assert.deepEqual(removed.addedIds, mode === "shadow" ? [] : ["read"]);
    assert.deepEqual(removed.receipt.request.options.map(option => option.id), ["read", "needs_clarification"]);
    assert.deepEqual(Object.keys(removed.receipt.evidence!.probabilities), ["read", "needs_clarification"]);
    assert.equal(restored.outcome, "selected");
    assert.deepEqual(restored.selectedIds, ["inspect"]);
    assert.deepEqual(restored.exposedIds, mode === "shadow" ? ["read", "inspect"] : ["inspect"]);
    assert.deepEqual(restored.addedIds, ["inspect"]);
    assert.deepEqual(restored.evictedIds, mode === "shadow" ? [] : ["read"]);
    assert.deepEqual(restored.receipt.request.options.map(option => option.id), ["read", "inspect", "needs_clarification"]);
    assert.deepEqual(Object.keys(restored.receipt.evidence!.probabilities), ["read", "inspect", "needs_clarification"]);
    for (const observation of [before, removed, restored]) {
      assert.equal(Object.values(observation.receipt.evidence!.probabilities).reduce((sum, probability) => sum + probability, 0), 1);
    }
  }
});
