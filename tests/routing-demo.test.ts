import { test } from "node:test";
import assert from "node:assert/strict";
import * as host from "../examples/routing/demo-state.js";

test("custom chat text clarifies locally and availability changes evict old schemas", async () => {
  const initial = await host.runDemo({ intent: "Read src/sum.ts in the synthetic workspace.", availableIds: ["read_file", "propose_patch", "inspect_agent"], mode: "lean", topK: 1, maxCostUnits: 10 });
  assert.deepEqual(initial.context.state.loadedIds, ["read_file"]);
  const disabled = await host.runDemo({ intent: initial.comparison.receipt.request.intent, availableIds: ["inspect_agent"], mode: "lean", topK: 1, maxCostUnits: 10 }, initial.context.state);
  assert.deepEqual(disabled.context.evictedIds, ["read_file"]);
  assert.deepEqual(disabled.context.addedIds, ["inspect_agent"]);
  const custom = await host.runDemo({ intent: "<img src=x onerror=alert(1)>", availableIds: ["read_file"], mode: "lean", topK: 1, maxCostUnits: 10 }, disabled.context.state);
  assert.equal(custom.comparison.receipt.outcome, "needs_clarification");
  assert.equal(custom.comparison.receipt.request.intent, "<img src=x onerror=alert(1)>");
  assert.deepEqual(custom.context.state.loadedIds, []);
  assert.equal(custom.comparison.receipt.execution.applied, false);
});
