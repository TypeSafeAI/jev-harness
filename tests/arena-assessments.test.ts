import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSESSMENT_KEY, readAssessments, saveAssessment, clearAssessments, pairedPass, type Assessment } from "../examples/arena/assessments.js";
const entry: Assessment = { runId: "run-a", baseline: "pass", integrated: "fail", note: "Check required evidence before reducing the menu.", updatedAt: "2026-09-22T00:00:00Z" };
function memory() { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } }; }
test("human assessments round-trip independently of credentials and immutable run evidence", () => {
  const storage = memory(); storage.setItem("jev-key", "synthetic-value");
  const result = saveAssessment(storage, { ...entry, extra: "private" } as Assessment, ["run-a"], undefined);
  assert.equal(result.saved, true); assert.deepEqual(readAssessments(storage).entries, [entry]);
  assert.ok(!storage.getItem(ASSESSMENT_KEY)?.includes("private"));
  assert.equal(clearAssessments(storage), null); assert.equal(storage.getItem("jev-key"), "synthetic-value");
});
test("assessment updates merge and retention drops only runs outside the current cache", () => {
  const storage = memory(); saveAssessment(storage, entry, ["run-a"], undefined);
  saveAssessment(storage, { ...entry, runId: "run-b" }, ["run-a", "run-b"], undefined);
  assert.equal(readAssessments(storage).entries.length, 2);
  saveAssessment(storage, { ...entry, integrated: "pass" }, ["run-a"], entry);
  assert.equal(readAssessments(storage).entries.length, 1);
  assert.equal(pairedPass(readAssessments(storage).entries[0]), true);
  assert.equal(pairedPass(entry), false); assert.equal(pairedPass(undefined), false);
});
test("bad or unavailable storage never claims an assessment saved or destroys the prior cache", () => {
  const storage = memory(); storage.setItem(ASSESSMENT_KEY, "broken");
  assert.equal(saveAssessment(storage, entry, ["run-a"], undefined).saved, false); assert.equal(storage.getItem(ASSESSMENT_KEY), "broken");
  assert.match(readAssessments(storage).error!, /read/);
  const denied = { ...storage, getItem: () => { throw Error(); } }; assert.match(readAssessments(denied).error!, /unavailable/);
  storage.removeItem(ASSESSMENT_KEY); saveAssessment(storage, entry, ["run-a"], undefined); const before = storage.getItem(ASSESSMENT_KEY);
  const full = { ...storage, setItem: () => { throw Error(); } };
  assert.equal(saveAssessment(full, { ...entry, integrated: "pass" }, ["run-a"], entry).saved, false); assert.equal(storage.getItem(ASSESSMENT_KEY), before);
});
test("assessment inputs are bounded and invalid quality labels cannot count as passing", () => {
  for (const change of [{ baseline: "safe" }, { note: "x".repeat(1001) }, { updatedAt: "no-date" }, { runId: "" }]) assert.equal(saveAssessment(memory(), { ...entry, ...change } as Assessment, ["run-a"], undefined).saved, false);
  assert.equal(saveAssessment(memory(), entry, ["different-run"], undefined).saved, false);
});

test("stale assessment saves preserve a newer write or deletion", () => {
  const storage = memory();
  saveAssessment(storage, entry, ["run-a"], undefined);
  const newer = { ...entry, note: "Another tab's new evidence", updatedAt: "2026-09-22T00:01:00Z" };
  assert.equal(saveAssessment(storage, newer, ["run-a"], entry).saved, true);
  const stale = saveAssessment(storage, { ...entry, note: "Queued stale draft" }, ["run-a"], entry);
  assert.equal(stale.saved, false); assert.match(stale.error!, /changed in another tab/);
  assert.deepEqual(stale.entries, [newer]); assert.deepEqual(readAssessments(storage).entries, [newer]);
  assert.equal(saveAssessment(storage, { ...newer, note: "Reviewed new revision" }, ["run-a"], newer).saved, true);
  clearAssessments(storage);
  assert.equal(saveAssessment(storage, entry, ["run-a"], newer).saved, false);
  assert.equal(storage.getItem(ASSESSMENT_KEY), null);
  assert.equal(saveAssessment(storage, entry, ["run-a"], undefined).saved, true);
});
