import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, JEV_MODEL, type Receipt, type JevReview } from "../src";
import { AUDIT_POLICY_VERSION, canonicalJson, createBoundReceipt, replayBoundReceipt, type EvidenceBinding } from "../src/audit/receipt";
function sample(threshold = 0.8) {
  const proposal = { tool: "read_file" as const, path: "a.ts", rationale: "Inspect synthetic input", evidence: [] };
  const answers: NonNullable<JevReview["answers"]> = {
    addresses_task: { probability: 0.7, answer: "yes", confidence: 0.7 },
    evidence_supports: { probability: 0.7, answer: "yes", confidence: 0.7 },
    unrelated_changes: { probability: 0.3, answer: "no", confidence: 0.7 },
    needs_clarification: { probability: 0.3, answer: "no", confidence: 0.7 },
  };
  const jev: JevReview = { model: JEV_MODEL, answers, error: null, latencyMs: 1, source: "mock" };
  const validation = { ok: true, errors: [] };
  const decision = decide(validation, jev, threshold);
  const receipt: Receipt = { schemaVersion: 1, fixtureId: "synthetic", arm: "good", mode: "plus_jev", proposer: "fixture", proposal, validation, jev, ...decision, execution: { applied: false, status: "recorded_pending", note: "Nothing ran." }, at: "2026-09-22T00:00:00Z" };
  const workspace = { task: "Read the synthetic file", files: { "a.ts": "export const x = 1;" } };
  const questions = Object.fromEntries(Object.keys(answers).map(id => [id, { type: "noul", instructions: "Synthetic audit test only" }]));
  const binding: EvidenceBinding = { policyVersion: AUDIT_POLICY_VERSION, decisionRevision: "a".repeat(40), threshold, questionSetVersion: 1, requestedModel: JEV_MODEL, source: "mock", workspace, requestBody: JSON.stringify({ model: JEV_MODEL, questions, state: { ...workspace, proposal } }) };
  return { receipt, binding };
}

test("bound receipt replays without any transport and preserves schema v1", () => {
  const { receipt, binding } = sample();
  const envelope = createBoundReceipt(receipt, binding);
  assert.equal(envelope.receipt.schemaVersion, 1);
  assert.deepEqual(replayBoundReceipt(JSON.parse(JSON.stringify(envelope)), binding), { ok: true, decision: decide(receipt.validation, receipt.jev, binding.threshold) });
  receipt.proposal.rationale = "mutated after recording";
  assert.notEqual(envelope.receipt.proposal.rationale, receipt.proposal.rationale);
});

test("threshold ambiguity and dirty-workspace changes are detected", () => {
  const low = sample(0.6), high = sample(0.8);
  assert.equal(low.receipt.verdict, "permit");
  assert.equal(high.receipt.verdict, "proposal_only");
  const envelope = createBoundReceipt(low.receipt, low.binding);
  assert.equal(replayBoundReceipt(envelope, high.binding).ok, false);
  const changed = structuredClone(low.binding);
  changed.workspace.files["a.ts"] = "export const x = 2;";
  assert.equal(replayBoundReceipt(envelope, changed).ok, false);
});

test("tampering with recorded answers, metadata, and digest is detected", () => {
  const { receipt, binding } = sample();
  for (const field of ["reason", "at", "proposer"] as const) {
    const envelope = createBoundReceipt(receipt, binding);
    envelope.receipt[field] = "tampered";
    assert.equal(replayBoundReceipt(envelope, binding).ok, false);
  }
  const changedAnswers = createBoundReceipt(receipt, binding);
  if (changedAnswers.receipt.jev?.answers) changedAnswers.receipt.jev.answers.addresses_task.probability = 0.99;
  assert.equal(replayBoundReceipt(changedAnswers, binding).ok, false);
  const envelope = createBoundReceipt(receipt, binding);
  envelope.integrity.digest = "0".repeat(64);
  assert.equal(replayBoundReceipt(envelope, binding).ok, false);
});

test("model/source mismatches and substituted request state are refused", () => {
  const { receipt, binding } = sample();
  assert.throws(() => createBoundReceipt(receipt, { ...binding, source: "jev" }), /mismatch/);
  const wrong = JSON.parse(binding.requestBody!);
  wrong.state.proposal.path = "other.ts";
  assert.throws(() => createBoundReceipt(receipt, { ...binding, requestBody: JSON.stringify(wrong) }), /does not match/);
  assert.throws(() => createBoundReceipt(receipt, { ...binding, questionSetVersion: 2 }), /Unsupported/);
});

test("stored verdicts and execution claims must match offline replay", () => {
  const { receipt, binding } = sample();
  assert.throws(() => createBoundReceipt({ ...receipt, verdict: "permit" }, binding), /does not replay/);
  assert.throws(() => createBoundReceipt({ ...receipt, execution: { ...receipt.execution, status: "withheld" } }, binding), /does not replay/);
});

test("canonical encoding rejects lossy JSON and cyclic input", () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  for (const value of [undefined, Number.NaN, Infinity, Array(1), { x: undefined }, new Date()])
    assert.throws(() => canonicalJson(value));
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /Cyclic/);
  assert.equal(replayBoundReceipt(null, sample().binding).ok, false);
});


test("no-review and failed-review receipts remain auditable without inventing success", () => {
  const { receipt, binding } = sample();
  const noReview: Receipt = { ...receipt, jev: null, ...decide(receipt.validation, null), execution: { applied: false, status: "withheld", note: "Nothing ran." } };
  const noBinding: EvidenceBinding = { ...binding, source: "none", requestBody: null };
  assert.equal(replayBoundReceipt(createBoundReceipt(noReview, noBinding), noBinding).ok, true);
  const failure: JevReview = { model: JEV_MODEL, answers: null, error: "synthetic timeout", source: "mock", latencyMs: 1 };
  const failed: Receipt = { ...noReview, jev: failure, ...decide(receipt.validation, failure) };
  assert.equal(replayBoundReceipt(createBoundReceipt(failed, binding), binding).ok, true);
});

test("receipt enums must be strings rather than coercible arrays", () => {
  for (const field of ["mode", "arm"] as const) {
    const { receipt, binding } = sample();
    const malformed = { ...receipt, [field]: [receipt[field]] } as unknown as Receipt;
    assert.throws(() => createBoundReceipt(malformed, binding), /Malformed receipt/);
  }
  const { receipt, binding } = sample();
  const malformed = { ...receipt, proposal: { ...receipt.proposal, tool: ["propose_patch"] } } as unknown as Receipt;
  const request = JSON.parse(binding.requestBody!);
  request.state.proposal = malformed.proposal;
  assert.throws(() => createBoundReceipt(malformed, { ...binding, requestBody: JSON.stringify(request) }), /Malformed proposal/);
});

test("contradictory validation cannot retain provider evidence in an audit receipt", () => {
  const { receipt, binding } = sample();
  const validation = { ok: true, errors: ["synthetic validation failure"] };
  const rejected: Receipt = { ...receipt, validation, ...decide(validation, receipt.jev),
    execution: { applied: false, status: "withheld", note: "Nothing ran." } };
  assert.throws(() => createBoundReceipt(rejected, binding), /Rejected validation/);
  const noReview = { ...rejected, jev: null };
  const noBinding: EvidenceBinding = { ...binding, source: "none", requestBody: null };
  assert.equal(replayBoundReceipt(createBoundReceipt(noReview, noBinding), noBinding).ok, true);
});

test("canonical size limits include escaped strings, keys, and container overhead", () => {
  assert.equal(canonicalJson("x".repeat(1_999_998)).length, 2_000_000);
  assert.throws(() => canonicalJson("x".repeat(1_999_999)), /size limit/);
  assert.throws(() => canonicalJson("\n".repeat(1_000_000)), /size limit/);
  assert.throws(() => canonicalJson({ ["x".repeat(2_000_000)]: 0 }), /size limit/);
  assert.throws(() => canonicalJson(["x".repeat(999_998), "x".repeat(999_998)]), /size limit/);
});


test("created receipts reserve the full envelope size needed for replay", () => {
  const { receipt, binding } = sample();
  const noReview: Receipt = { ...receipt, jev: null, ...decide(receipt.validation, null),
    execution: { applied: false, status: "withheld", note: "Nothing ran." } };
  const noBinding: EvidenceBinding = { ...binding, source: "none", requestBody: null };
  noBinding.workspace.files["a.ts"] = "";
  const overhead = JSON.stringify(createBoundReceipt(noReview, noBinding)).length;
  noBinding.workspace.files["a.ts"] = "x".repeat(2_000_000 - overhead);
  const envelope = createBoundReceipt(noReview, noBinding);
  assert.equal(JSON.stringify(envelope).length, 2_000_000);
  assert.equal(replayBoundReceipt(envelope, noBinding).ok, true);
  noBinding.workspace.files["a.ts"] += "x";
  assert.throws(() => createBoundReceipt(noReview, noBinding), /size limit/);
});

test("created receipts reserve the integrity fields in the structural budget", () => {
  const { receipt, binding } = sample();
  const noReview: Receipt = { ...receipt, jev: null, ...decide(receipt.validation, null),
    execution: { applied: false, status: "withheld", note: "Nothing ran." } };
  const noBinding: EvidenceBinding = { ...binding, source: "none", requestBody: null };
  const count = (value: unknown): number => 1 + (value && typeof value === "object"
    ? Object.values(value).reduce<number>((total, child) => total + count(child), 0) : 0);
  const overhead = count(createBoundReceipt(noReview, noBinding));
  noReview.proposal.evidence = Array<string>(100_000 - overhead).fill("");
  const envelope = createBoundReceipt(noReview, noBinding);
  assert.equal(replayBoundReceipt(envelope, noBinding).ok, true);
  noReview.proposal.evidence.push("");
  assert.throws(() => createBoundReceipt(noReview, noBinding), /structural limits/);
});
