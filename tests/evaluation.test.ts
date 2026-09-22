import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareProposerInput, summarizeEvaluation, type EvaluationRow } from "../src/benchmark/evaluation";
const row = (overrides: Partial<EvaluationRow> = {}): EvaluationRow => ({
  cohort: "synthetic-frozen-v1", source: "mock", runId: "r1", caseId: "c1",
  mode: "plus_jev", label: "unacceptable", validationPassed: true,
  verdict: "proposal_only", providerCalls: ["answered"], ...overrides,
});

test("synthetic repeated cases keep pipeline, provider, and unique semantic counts separate", () => {
  const rows: EvaluationRow[] = [];
  for (let run = 0; run < 4; run++) for (let i = 0; i < 40; i++) {
    const structural = i < 7;
    rows.push(row({ runId: `r${run}`, caseId: `c${i}`, validationPassed: !structural,
      label: i < 20 ? "unacceptable" : i < 38 ? "acceptable" : "clarification_required",
      verdict: structural ? "reject" : i >= 20 && i < 38 ? "permit" : "proposal_only",
      providerCalls: structural ? [] : ["answered"] }));
  }
  const result = summarizeEvaluation(rows);
  assert.equal(result.runs, 4);
  assert.equal(result.distinctCases, 40);
  assert.deepEqual(result.byMode.plus_jev, {
    pipelineCases: 160, validationRejected: 28, providerCallAttempts: 132,
    providerCallFailures: 0, unavailableCases: 0, semanticBadObservations: 52,
    distinctSemanticBadCases: 13, badPermits: 0, acceptableProposalsHeld: 0,
    legitimateAbstentions: 8, clarificationPermits: 0,
  });
});

test("retries and unavailable pipeline outcomes use different denominators", () => {
  const result = summarizeEvaluation([
    row({ providerCalls: ["unavailable", "answered"] }),
    row({ caseId: "c2", verdict: "unavailable", providerCalls: ["unavailable"] }),
    row({ caseId: "c3", verdict: "unavailable", providerCalls: [] }),
  ]).byMode.plus_jev;
  assert.equal(result.pipelineCases, 3);
  assert.equal(result.providerCallAttempts, 3);
  assert.equal(result.providerCallFailures, 2);
  assert.equal(result.unavailableCases, 2);
  assert.equal(result.distinctSemanticBadCases, 1);
});

test("base results cannot masquerade as reviewed semantic coverage", () => {
  const result = summarizeEvaluation([row({ mode: "base", verdict: "permit", providerCalls: [] })]);
  assert.equal(result.byMode.base.badPermits, 1);
  assert.equal(result.byMode.base.providerCallAttempts, 0);
  assert.equal(result.byMode.base.distinctSemanticBadCases, 0);
  assert.throws(() => summarizeEvaluation([row({ mode: "base" })]), /validate-only/);
});

test("mixed treatments, duplicates, and relabeling are rejected", () => {
  assert.throws(() => summarizeEvaluation([row(), row({ caseId: "c2", source: "jev" })]), /Mixed/);
  assert.throws(() => summarizeEvaluation([row(), row({ caseId: "c2", cohort: "other" })]), /Mixed/);
  assert.throws(() => summarizeEvaluation([row(), row()]), /Duplicate/);
  assert.throws(() => summarizeEvaluation([row(), row({ runId: "r2", label: "acceptable" })]), /labels changed/);
  assert.throws(() => summarizeEvaluation([row({ validationPassed: false })]), /Validation rejection/);
  assert.throws(() => summarizeEvaluation([row({ providerCalls: [] })]), /disagree/);
  assert.equal(summarizeEvaluation([]).cohort, null);
});

test("blinding drops extra labels and detaches the proposer input at runtime", () => {
  const fixture = { task: "Read the synthetic helper", files: { "a.ts": "export const n = 1;" },
    evidence: ["export const n = 1;"], arm: "bad", expected: "reject", mock: { p: 0 }, proposals: { secret: "label" } };
  const input = prepareProposerInput(fixture);
  assert.deepEqual(Object.keys(input).sort(), ["evidence", "files", "task"]);
  assert.equal(JSON.stringify(input).includes("expected"), false);
  fixture.files["a.ts"] = "changed"; fixture.evidence.push("changed");
  assert.equal(input.files["a.ts"], "export const n = 1;");
  assert.equal(input.evidence.length, 1);
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.files), true);
  assert.equal(Object.isFrozen(input.evidence), true);
});

test("a frozen case cannot change structural validation across modes or runs", () => {
  const rejected = row({ runId: "r2", validationPassed: false, verdict: "reject", providerCalls: [] });
  assert.throws(() => summarizeEvaluation([row(), rejected]), /validation changed/);
  assert.throws(() => summarizeEvaluation([row(), { ...rejected, runId: "r1", mode: "base" }]), /validation changed/);
});

test("evaluation arrays reject custom behavior instead of bypassing accounting", () => {
  let reads = 0;
  const calls = ["invalid"] as unknown as EvaluationRow["providerCalls"];
  Object.defineProperty(calls, Symbol.iterator, { value: function* () { reads++; yield "answered"; } });
  assert.throws(() => summarizeEvaluation([row({ providerCalls: calls })]), /Malformed/);
  const observations = [row()];
  Object.defineProperty(observations, Symbol.iterator, { value: function* () { reads++; } });
  assert.throws(() => summarizeEvaluation(observations), /array/);
  assert.equal(reads, 0);
});

test("blinded evidence is read once as plain data without iterators or getters", () => {
  let reads = 0;
  const evidence = ["synthetic excerpt"];
  Object.defineProperty(evidence, Symbol.iterator, { value: function* () {
    yield reads++ === 0 ? "synthetic excerpt" : { expected: "permit" };
  } });
  const input = { task: "Inspect the synthetic file", files: { "a.ts": "example" }, evidence };
  assert.throws(() => prepareProposerInput(input), /Malformed proposer/);
  const accessor = Object.defineProperty([], "0", { get() { reads++; return "example"; } });
  assert.throws(() => prepareProposerInput({ ...input, evidence: accessor }), /Malformed proposer/);
  assert.equal(reads, 0);
});
