import { test } from "node:test";
import assert from "node:assert/strict";
import * as publicApi from "../src";
import { decideBase } from "../src/benchmark";

test("benchmark helper is absent from the normal public API", () => {
  assert.equal(Object.hasOwn(publicApi, "decideBase"), false);
  assert.equal(typeof publicApi.decide, "function");
});

test("base permit retains explicit no-review provenance", () => {
  const decision = decideBase({ ok: true, errors: [] });
  assert.equal(decision.verdict, "permit");
  assert.equal(decision.mode, "base");
  assert.equal(decision.source, "none");
  assert.equal(decision.reviewed, false);
  const parsed = JSON.parse(JSON.stringify(decision));
  assert.equal(parsed.reviewed, false);
  assert.equal(publicApi.decide({ ok: true, errors: [] }, null).verdict, "unavailable");
});
