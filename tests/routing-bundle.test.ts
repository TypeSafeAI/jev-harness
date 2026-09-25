import { test } from "node:test";
import assert from "node:assert/strict";
import { routeTools } from "../src/routing/route.js";
import { assembleToolBundle } from "../src/routing/bundle.js";
import { DEMO_CATALOG, DEMO_POLICY, SCENARIOS, scenarioRouter } from "../examples/routing/scenarios.js";

async function patchReceipt(availableIds: readonly string[] = DEMO_CATALOG.map(t => t.id), maxCostUnits = 10) {
  return routeTools(DEMO_CATALOG, { intent: "Propose a patch to the synthetic helper.", availableIds }, { ...DEMO_POLICY, maxCostUnits }, scenarioRouter(SCENARIOS.find(s => s.id === "patch")!));
}

test("host-declared prerequisites retain read access without relabeling Jev's selection", async () => {
  const receipt = await patchReceipt();
  const bundle = assembleToolBundle(receipt, { propose_patch: ["read_file"] });
  assert.equal(bundle.status, "ready");
  assert.deepEqual(receipt.selectedIds, ["propose_patch"]);
  assert.deepEqual(bundle.rootIds, ["propose_patch"]);
  assert.deepEqual(bundle.prerequisiteIds, ["read_file"]);
  assert.deepEqual(bundle.context.state.loadedIds, ["read_file", "propose_patch"]);
  assert.equal(bundle.estimatedCostUnits, 4);
  assert.deepEqual(bundle.blockedIds, []);
  assert.equal(receipt.execution.applied, false);
  assert.ok(Object.isFrozen(bundle.context.tools));
});

test("missing or over-budget prerequisites withhold the entire handoff", async () => {
  const unavailable = assembleToolBundle(await patchReceipt(["propose_patch"]), { propose_patch: ["read_file"] });
  assert.equal(unavailable.status, "withheld");
  assert.deepEqual(unavailable.blockedIds, ["read_file"]);
  assert.deepEqual(unavailable.context.state.loadedIds, []);
  const costly = assembleToolBundle(await patchReceipt(undefined, 3), { propose_patch: ["inspect_agent"] });
  assert.deepEqual(costly.blockedIds, ["inspect_agent"]);
  assert.deepEqual(costly.context.state.loadedIds, []);
});

test("dependency closure is transitive, deduplicated and cannot invent a descriptor", async () => {
  const receipt = await patchReceipt();
  const result = assembleToolBundle(receipt, { propose_patch: ["inspect_agent", "read_file"], inspect_agent: ["read_file"] });
  assert.deepEqual(result.context.state.loadedIds, DEMO_CATALOG.map(t => t.id));
  assert.equal(result.estimatedCostUnits, 13);
  assert.throws(() => assembleToolBundle(receipt, { propose_patch: ["unknown_tool"] }), /catalog/);
  assert.throws(() => assembleToolBundle(receipt, { propose_patch: ["read_file"], read_file: ["propose_patch"] }), /cycle/);
  assert.throws(() => assembleToolBundle(receipt, { propose_patch: ["read_file", "read_file"] }), /unique/);
});

test("failed routing and cancellation never expose dependencies, and state tracks eviction", async () => {
  const receipt = await patchReceipt();
  const prior = { loadedIds: ["inspect_agent"] };
  const controller = new AbortController(); controller.abort();
  const cancelled = assembleToolBundle(receipt, { propose_patch: ["read_file"] }, { previous: prior, signal: controller.signal });
  assert.equal(cancelled.status, "withheld");
  assert.deepEqual(cancelled.context.state.loadedIds, []);
  assert.deepEqual(cancelled.context.evictedIds, ["inspect_agent"]);
  const failed = assembleToolBundle({ ...receipt, outcome: "unavailable", selectedIds: [] }, { propose_patch: ["read_file"] });
  assert.equal(failed.status, "withheld");
  assert.deepEqual(failed.context.state.loadedIds, []);
  const active = assembleToolBundle(receipt, { propose_patch: ["read_file"] }, { previous: prior });
  assert.deepEqual(active.context.addedIds, ["read_file", "propose_patch"]);
  assert.deepEqual(active.context.evictedIds, ["inspect_agent"]);
});
