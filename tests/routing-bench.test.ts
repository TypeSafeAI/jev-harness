import { test } from "node:test";
import assert from "node:assert/strict";
import * as demo from "../examples/routing/scenarios.js";
import * as bench from "../examples/routing/compare.js";

test("paired synthetic evaluation measures inclusion separately from selection", async () => {
  assert.equal(typeof bench.compareScenario, "function");
  for (const scenario of demo.SCENARIOS) {
    const pair = await bench.compareScenario(scenario);
    assert.equal(pair.receipt.outcome, scenario.expectedOutcome, scenario.id);
    assert.equal(pair.expectationMet, true, scenario.id);
    assert.equal(pair.metrics.executionLatencyMs, null);
    assert.equal(pair.metrics.providerTokens, null);
    assert.ok(pair.metrics.fullContextBytes >= pair.metrics.leanContextBytes);
    assert.ok(pair.metrics.leanTotalEstimatedInputTokens >= pair.metrics.leanContextEstimatedTokens);
    assert.equal(pair.receipt.source, "mock");
    assert.equal(pair.receipt.execution.applied, false);
    assert.equal(JSON.stringify(pair.receipt.request).includes("expected"), false);
  }
});

test("availability changes the closed set and context immediately", async () => {
  const pair = await bench.compareScenario(demo.SCENARIOS[0]!, ["inspect_agent"]);
  assert.deepEqual(pair.receipt.selectedIds, ["inspect_agent"]);
  assert.deepEqual(pair.full.state.loadedIds, ["inspect_agent"]);
  assert.equal(pair.metrics.cheapestAcceptableSelected, true);
  const empty = await bench.compareScenario(demo.SCENARIOS[0]!, []);
  assert.equal(empty.receipt.outcome, "no_match");
  assert.equal(empty.metrics.cheapestAcceptableSelected, null);
});

test("evaluation labels cannot influence scripted routing evidence", async () => {
  const scenario = demo.SCENARIOS[0]!;
  const original = await bench.compareScenario(scenario, ["read_file"]);
  const relabeled = await bench.compareScenario({ ...scenario, acceptableIds: [], expectedOutcome: "unavailable" }, ["read_file"]);
  assert.deepEqual(relabeled.receipt, original.receipt);
});

test("comparison metrics use the same snapshot as the receipt", async () => {
  const scenario = structuredClone(demo.SCENARIOS[0]!);
  const available = demo.DEMO_CATALOG.map(tool => tool.id);
  const policy = { ...demo.DEMO_POLICY };
  const pending = bench.compareScenario(scenario, available, policy);
  available.length = 0;
  policy.maxCostUnits = 0;
  scenario.acceptableIds = [];
  scenario.expectedOutcome = "unavailable";
  const result = await pending;
  assert.equal(result.metrics.leanAcceptableToolIncluded, true);
  assert.equal(result.metrics.cheapestAcceptableSelected, true);
  assert.equal(result.expectationMet, true);
});
