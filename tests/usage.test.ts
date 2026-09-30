import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeUsage, parseEntries } from "../examples/routing/usage.js";
test("usage preserves partial and unknown calls without claiming zero cost", () => {
  const entries = parseEntries(JSON.stringify([
    { at: "2026-09-22T00:00:00Z", status: "success", input: 100, output: 20, latencyMs: 10, keySource: "personal" },
    { at: "2026-09-22T00:00:01Z", status: "failed", input: null, output: null, latencyMs: null, keySource: "host" },
  ]));
  assert.deepEqual(summarizeUsage(entries), { requests: 2, providerRequests: null, observedProviderRequests: 0, retryRequests: 0, input: 100, output: 20, unknown: 1 });
  assert.deepEqual(parseEntries('[{"input":-1}]'), []);
  assert.deepEqual(parseEntries('not json'), []);
});
