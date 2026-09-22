import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "../src/routing/index.js";

const tools: api.ToolDefinition[] = [
  { id: "read", kind: "tool", description: "Read a synthetic file", estimatedCostUnits: 1, inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative synthetic path" } }, required: ["path"], additionalProperties: false } },
  { id: "specialist", kind: "subagent", description: "Inspect a synthetic file", estimatedCostUnits: 8, inputSchema: { type: "object", properties: { task: { type: "string", description: "Task to inspect" } }, required: ["task"], additionalProperties: false } },
];
const policy: api.RoutingPolicy = { topK: 1, confidenceFloor: 0.7, probabilityFloor: 0.2, relevanceWindow: 0.1, maxCostUnits: 10 };
const input = { intent: "Read the example file", availableIds: ["read", "specialist"] };
const evidence = { model: "jev-1.13.0", choice: "specialist", confidence: 0.9, probabilities: { read: 0.46, specialist: 0.5, needs_clarification: 0.04 } };
const router = (value: unknown): api.ToolRouter => ({ source: "mock", review: async () => value });
const run = (value: unknown = evidence, overrides = {}) => api.routeTools(api.createCatalog(tools), input, { ...policy, ...overrides }, router(value));

test("catalog is a detached immutable schema registry with unique closed-set ids", () => {
  assert.equal(typeof api.createCatalog, "function");
  const copy = structuredClone(tools);
  const catalog = api.createCatalog(copy);
  copy[0]!.inputSchema.properties.path!.description = "changed";
  assert.equal(catalog[0]!.inputSchema.properties.path!.description, "Relative synthetic path");
  assert.ok(Object.isFrozen(catalog[0]!.inputSchema.properties));
  for (const invalid of [[tools[0]!, tools[0]!], [{ ...tools[0]!, id: "needs_clarification" }], [{ ...tools[0]!, estimatedCostUnits: NaN }], [{ ...tools[0]!, inputSchema: { ...tools[0]!.inputSchema, required: ["missing"] } }]])
    assert.throws(() => api.createCatalog(invalid));
});

test("compact adapter payload excludes schemas, fixture labels and cost metadata", async () => {
  let payload: api.RoutingRequest | undefined;
  const result = await api.routeTools(api.createCatalog(tools), input, policy, { source: "mock", review: async p => { payload = p; return evidence; } });
  assert.equal(payload!.model, "jev-1.13.0");
  assert.match(payload!.untrustedDataNote, /untrusted/);
  assert.deepEqual(Object.keys(payload!.options[0]!).sort(), ["description", "id", "kind"]);
  assert.equal(JSON.stringify(payload).includes("inputSchema"), false);
  assert.deepEqual(result.selectedIds, ["read"]);
  assert.equal(result.execution.applied, false);
  assert.match(result.reason, /cost.*evidence.*authorization/i);
});

test("confidence, clarification, cost and top-k are deterministic policy", async () => {
  assert.equal((await run({ ...evidence, confidence: 0.69 })).outcome, "needs_clarification");
  assert.equal((await run({ ...evidence, choice: "needs_clarification", probabilities: { read: 0.1, specialist: 0.1, needs_clarification: 0.8 } })).outcome, "needs_clarification");
  assert.equal((await run(evidence, { maxCostUnits: 0 })).outcome, "no_match");
  assert.deepEqual((await run(evidence, { topK: 2 })).selectedIds, ["read", "specialist"]);
  assert.deepEqual((await run(evidence, { relevanceWindow: 0 })).selectedIds, ["specialist"]);
  assert.deepEqual((await run(evidence, { probabilityFloor: 0.6 })).selectedIds, []);
  for (const overrides of [{ topK: 0 }, { topK: 1.5 }, { confidenceFloor: NaN }, { relevanceWindow: -1 }, { probabilityFloor: 2 }, { maxCostUnits: Infinity }])
    await assert.rejects(() => run(evidence, overrides));
});

test("malformed or out-of-set evidence never loads tools", async () => {
  for (const value of [null, {}, { ...evidence, model: "jev-latest" }, { ...evidence, confidence: 2 }, { ...evidence, choice: "read" }, { ...evidence, probabilities: { read: 1 } }, { ...evidence, probabilities: { ...evidence.probabilities, hidden: 0 } }, { ...evidence, probabilities: { read: NaN, specialist: 0.5, needs_clarification: 0.5 } }, { ...evidence, probabilities: { read: -0.1, specialist: 1, needs_clarification: 0.1 } }]) {
    const result = await run(value);
    assert.equal(result.outcome, "unavailable");
    assert.deepEqual(result.selectedIds, []);
    assert.equal(result.evidence, null);
  }
});

test("availability and abort are enforced before and after the adapter", async () => {
  const catalog = api.createCatalog(tools);
  let calls = 0;
  const adapter: api.ToolRouter = { source: "mock", review: async () => { calls++; throw Error("private error content"); } };
  assert.equal((await api.routeTools(catalog, { ...input, availableIds: [] }, policy, adapter)).outcome, "no_match");
  assert.equal(calls, 0);
  await assert.rejects(() => api.routeTools(catalog, { ...input, availableIds: ["hidden"] }, policy, adapter));
  await assert.rejects(() => api.routeTools(catalog, { ...input, availableIds: ["read", "read"] }, policy, adapter));
  const failed = await api.routeTools(catalog, input, policy, adapter);
  assert.equal(failed.outcome, "unavailable");
  assert.equal(JSON.stringify(failed).includes("private error content"), false);
  const controller = new AbortController();
  controller.abort();
  await api.routeTools(catalog, input, policy, adapter, controller.signal);
  assert.equal(calls, 1);
  const late = new AbortController();
  const result = await api.routeTools(catalog, input, policy, { source: "mock", review: async () => { late.abort(); return evidence; } }, late.signal);
  assert.equal(result.outcome, "unavailable");
  const hidden = await api.routeTools(catalog, { ...input, availableIds: ["read"] }, policy, router(evidence));
  assert.equal(hidden.outcome, "unavailable");
});

test("pending reviews use detached snapshots and ignore adapter mutations", async () => {
  const mutable = structuredClone(input);
  const mutablePolicy = { ...policy };
  const result = await api.routeTools(api.createCatalog(tools), mutable, mutablePolicy, { source: "mock", review: async payload => {
    mutable.availableIds.length = 0;
    mutablePolicy.maxCostUnits = 0;
    assert.throws(() => { (payload.options as unknown[]).length = 0; });
    return evidence;
  } });
  assert.deepEqual(result.selectedIds, ["read"]);
  assert.equal(result.policy.maxCostUnits, 10);
});

test("context transitions expose real schema loads and evictions without executing", async () => {
  const receipt = await run();
  const full = api.assembleContext(receipt, "full");
  const lean = api.assembleContext(receipt, "lean", full.state);
  assert.deepEqual(full.state.loadedIds, ["read", "specialist"]);
  assert.deepEqual(lean.state.loadedIds, ["read"]);
  assert.deepEqual(lean.evictedIds, ["specialist"]);
  assert.ok(lean.serialized.length < full.serialized.length);
  const again = api.assembleContext(receipt, "full", lean.state);
  assert.deepEqual(again.addedIds, ["specialist"]);
  const unavailable = api.assembleContext(await run(null), "lean", lean.state);
  assert.deepEqual(unavailable.state.loadedIds, []);
  assert.deepEqual(unavailable.evictedIds, ["read"]);
  assert.throws(() => api.assembleContext(receipt, "invalid" as "lean"));
});

test("unsupported schema constraints are rejected instead of silently widened", () => {
  for (const inputSchema of [
    { ...tools[0]!.inputSchema, allOf: [{ required: ["path"] }] },
    { ...tools[0]!.inputSchema, properties: { path: { ...tools[0]!.inputSchema.properties.path!, enum: ["read"] } } },
  ]) assert.throws(() => api.createCatalog([{ ...tools[0]!, inputSchema }]));
});
