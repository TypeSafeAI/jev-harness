import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadFixtures } from "../src/benchmark/load.js";
import { createMockTransport } from "../src/benchmark/mock.js";
import { JEV_MODEL, REVIEW_QUESTION_IDS, type Fixture } from "../src/contract/types.js";
import { collect } from "../scripts/analyze-review-runs.js";
import { createReviewHttpTransport } from "../examples/host/review-experiment.js";
import { reviewProvenance, runReviewExperiment, type ReviewProvenance } from "../examples/review/experiment.js";
import { main, parseReviewArgs } from "../examples/review/experiment-cli.js";

const provenance: ReviewProvenance = { revision: "a".repeat(40), dirty: false, files: [] };
const now = () => "2026-09-24T00:00:00.000Z";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const fixtures = loadFixtures();
const clean = fixtures.find(f => f.category === "clean")!;
const response = () => ({ model: JEV_MODEL, answers: Object.fromEntries(REVIEW_QUESTION_IDS.map(id => [id, { type: "noul", noul: id === "addresses_task" || id === "evidence_supports" ? 0.99 : 0.01 }])) });
const output = () => { let stdout = "", stderr = ""; return { io: { stdout: (s: string) => { stdout += s; }, stderr: (s: string) => { stderr += s; } }, text: () => stdout + stderr }; };

test("repetitions preserve both receipt modes and record actual calls separately from cases", async () => {
  let calls = 0, active = 0, maximum = 0;
  const mock = createMockTransport(fixtures);
  const artifact = await runReviewExperiment({ runs: 2 }, { source: "mock", provenance, now, transport: async (payload, signal) => {
    calls++; maximum = Math.max(maximum, ++active);
    await Promise.resolve(); active--;
    return mock(payload, signal);
  } });
  assert.equal(artifact.status, "complete");
  assert.equal(artifact.receipts.length, 200);
  assert.equal(artifact.accounting.plusJevCases, 100);
  assert.equal(artifact.accounting.validationRejected, 14);
  assert.equal(calls, 86);
  assert.equal(maximum, 1);
  assert.equal(artifact.attempts.length, calls);
  assert.equal(artifact.accounting.providerAttempts, 0);
  assert.deepEqual([...new Set(artifact.receipts.map(r => r.runIndex))], [1, 2]);
  assert.equal(new Set(artifact.receipts.map(r => r.observationId)).size, 200);
  assert.ok(artifact.receipts.every(r => !r.execution.applied));
  assert.equal(artifact.summaries.length, 2);
  assert.equal(artifact.summaries[0]!.aggregate.totals.plusJev.expectedMet, 50);
  assert.equal(collect([artifact]).observations.length, 86);
});

test("validation rejection never invokes the transport", async () => {
  const fixture: Fixture = structuredClone(clean);
  fixture.proposals.good.path = "../outside.ts";
  fixture.proposals.bad.path = "../outside.ts";
  const artifact = await runReviewExperiment({ runs: 1 }, { fixtures: [fixture], source: "jev", provenance, now, transport: async () => { assert.fail("validation must precede transport"); } });
  assert.equal(artifact.attempts.length, 0);
  assert.equal(artifact.accounting.providerAttempts, 0);
  assert.ok(artifact.receipts.every(r => r.verdict === "reject" && r.jev === null));
});

test("requests exclude evaluation labels and question/profile hashes reproduce exactly", async () => {
  const seen: string[] = [];
  const make = () => runReviewExperiment({ runs: 1 }, { source: "mock", fixtures: [clean], provenance, now, transport: async payload => { seen.push(JSON.stringify(payload)); return response(); } });
  const first = await make(), second = await make();
  assert.deepEqual(first.metadata, second.metadata);
  assert.equal(first.metadata.questionHash, hash(first.metadata.questionsJson));
  assert.equal(first.metadata.profileHash, hash(first.metadata.profileJson));
  assert.equal(first.metadata.fixtureHash, hash(first.metadata.fixturesJson));
  assert.equal(first.metadata.evaluation.purpose, "evaluation_only");
  for (const body of seen) {
    const request = JSON.parse(body);
    assert.equal(request.model, JEV_MODEL);
    assert.deepEqual(Object.keys(request.state).sort(), ["evidence", "files", "note", "proposal", "task"]);
    assert.deepEqual(Object.keys(request.questions), [...REVIEW_QUESTION_IDS]);
    assert.ok(Object.values(request.questions).every(q => !(q as object).hasOwnProperty("criteria")));
  }
  assert.equal(first.attempts[0]!.requestBody, seen[0]);
  assert.equal(first.attempts[0]!.requestHash, hash(seen[0]!));
});

test("HTTP usage fields remain independently unknown and artifacts contain no credential or raw response text", async () => {
  const secret = "synthetic-private-key-canary";
  const handle = createReviewHttpTransport({ key: secret, fetch: async (_url, init) => {
    assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    return Response.json({ ...response(), usage: { input_tokens: 123, output_tokens: "missing" }, privateText: secret });
  } });
  const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, now, transport: handle.transport, measurement: () => handle.state.measurement });
  assert.equal(artifact.accounting.providerAttempts, artifact.attempts.length);
  assert.ok(artifact.attempts.every(a => a.inputTokens === 123 && a.outputTokens === null && a.status === "answered"));
  assert.equal(JSON.stringify(artifact).includes(secret), false);
  assert.ok(artifact.attempts.every(a => a.responseBytes !== null && a.latencyMs >= 0));
});

test("malformed replies and model mismatches remain unavailable with sanitized details", async () => {
  for (const reply of [{ ...response(), model: "private-provider-string" }, { model: JEV_MODEL, answers: {} }]) {
    const handle = createReviewHttpTransport({ key: "synthetic-test-key", fetch: async () => Response.json(reply) });
    const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, now, transport: handle.transport, measurement: () => handle.state.measurement });
    const reviewed = artifact.receipts.filter(r => r.mode === "plus_jev" && r.validation.ok);
    assert.ok(reviewed.length > 0 && reviewed.every(r => r.verdict === "unavailable"));
    assert.ok(artifact.attempts.every(a => a.status === "unavailable" && a.failure === "malformed_response"));
    assert.equal(JSON.stringify(artifact).includes("private-provider-string"), false);
  }
});

test("HTTP errors and thrown errors never retain provider bodies or exception text", async () => {
  for (const transport of [
    createReviewHttpTransport({ key: "synthetic-test-key", fetch: async () => new Response("private-body-canary", { status: 429 }) }).transport,
    async () => { throw Error("private-body-canary"); },
  ]) {
    const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, now, transport });
    assert.equal(JSON.stringify(artifact).includes("private-body-canary"), false);
    assert.ok(artifact.attempts.every(a => a.status === "unavailable"));
  }
});

test("usage coverage counts input and output independently across incomplete replies", async () => {
  let calls = 0;
  const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, now, transport: async () => ({ ...response(), usage: ++calls === 1 ? { input_tokens: 12 } : { output_tokens: 9 } }) });
  assert.equal(calls, 2);
  assert.deepEqual(artifact.reportedUsage, { inputTokens: { knownSum: 12, knownAttempts: 1, unknownAttempts: 1 }, outputTokens: { knownSum: 9, knownAttempts: 1, unknownAttempts: 1 } });
});

test("HTTP transport bounds response bytes, refuses redirects, and does not retry", async () => {
  let calls = 0, cancelled = false;
  const handle = createReviewHttpTransport({ key: "synthetic-test-key", fetch: async (_url, init) => {
    calls++; assert.equal(init!.redirect, "error");
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(64_001)); }, cancel() { cancelled = true; } }));
  } });
  const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, now, transport: handle.transport, measurement: () => handle.state.measurement });
  assert.equal(calls, 2);
  assert.equal(cancelled, true);
  assert.ok(artifact.attempts.every(a => a.status === "unavailable" && a.failure === "malformed_response"));
  assert.equal(artifact.accounting.retries, 0);
});

test("provenance hashes current source and raw fixture files independently of working directory", async () => {
  const current = reviewProvenance();
  assert.match(current.revision!, /^[a-f0-9]{40}$/);
  assert.equal(typeof current.dirty, "boolean");
  for (const path of ["examples/review/experiment.ts", "src/contract/review.ts", "scripts/experiment-review.ts"]) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.equal(current.files.find(file => file.path === path)!.sha256, hash(content));
  }
  assert.equal(current.files.filter(file => file.path.startsWith("fixtures/proposal-review/")).length, 25);
});

test("abort records the active attempt and paired receipts, then stops with partial accounting", async () => {
  const controller = new AbortController(); let calls = 0;
  const artifact = await runReviewExperiment({ runs: 4 }, { source: "jev", provenance, now, signal: controller.signal, transport: async () => { calls++; controller.abort(); throw Error("private-abort-detail"); } });
  assert.equal(calls, 1);
  assert.equal(artifact.status, "cancelled");
  assert.equal(artifact.receipts.length, 2);
  assert.equal(artifact.attempts[0]!.status, "cancelled");
  assert.equal(artifact.accounting.plannedPlusJevCases, 200);
  assert.equal(artifact.accounting.plusJevCases, 1);
  assert.equal(artifact.accounting.notStarted, 199);
  assert.equal(artifact.receipts[1]!.verdict, "unavailable");
});

test("pre-aborted experiment starts no pipeline or transport work", async () => {
  const artifact = await runReviewExperiment({ runs: 1 }, { source: "mock", provenance, now, signal: AbortSignal.abort(), transport: async () => assert.fail("no request") });
  assert.equal(artifact.receipts.length, 0);
  assert.equal(artifact.attempts.length, 0);
  assert.equal(artifact.accounting.notStarted, 50);
});

test("a transport returning successfully after cancellation records a cancelled failure", async () => {
  const controller = new AbortController();
  const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", provenance, now, signal: controller.signal, transport: async () => { controller.abort(); return response(); } });
  assert.equal(artifact.attempts.length, 1);
  assert.equal(artifact.attempts[0]!.status, "cancelled");
  assert.equal(artifact.attempts[0]!.failure, "cancelled");
  assert.equal(artifact.receipts[1]!.verdict, "unavailable");
});

test("late cancellation preserves an answered receipt and attempt accounting", async () => {
  for (const unfavorable of [false, true]) {
    const controller = new AbortController();
    let transportReturned = false, settledTimestamps = 0;
    const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, signal: controller.signal,
      now: () => {
        // The transport's finishedAt is first; the next timestamp belongs to the settled receipt.
        if (transportReturned && ++settledTimestamps === 2) controller.abort();
        return now();
      },
      transport: async () => {
        transportReturned = true;
        const reply = response();
        if (unfavorable) reply.answers.addresses_task!.noul = 0.01;
        return reply;
      },
    });
    assert.equal(artifact.status, "cancelled");
    assert.equal(artifact.receipts.length, 2);
    assert.equal(artifact.receipts[1]!.verdict, unfavorable ? "proposal_only" : "permit");
    assert.ok(artifact.receipts[1]!.jev!.answers);
    assert.equal(artifact.attempts[0]!.status, "answered");
    assert.equal(artifact.attempts[0]!.failure, null);
    assert.equal(artifact.accounting.answered, 1);
    assert.equal(artifact.accounting.unavailable, 0);
    assert.equal(artifact.accounting.notStarted, 1);
  }
});

test("late cancellation preserves settled unavailable failures", async () => {
  for (const failure of ["transport_error", "malformed_response"] as const) {
    const controller = new AbortController();
    let transportReturned = false, settledTimestamps = 0;
    const artifact = await runReviewExperiment({ runs: 1 }, { source: "jev", fixtures: [clean], provenance, signal: controller.signal,
      now: () => {
        if (transportReturned && ++settledTimestamps === 2) controller.abort();
        return now();
      },
      transport: async () => {
        transportReturned = true;
        if (failure === "transport_error") throw Error("synthetic transport failure");
        return { model: JEV_MODEL, answers: {} };
      },
    });
    assert.equal(artifact.status, "cancelled");
    assert.equal(artifact.receipts[1]!.verdict, "unavailable");
    assert.equal(artifact.attempts[0]!.status, "unavailable");
    assert.equal(artifact.attempts[0]!.failure, failure);
    assert.equal(artifact.accounting.answered, 0);
    assert.equal(artifact.accounting.unavailable, 1);
    assert.equal(artifact.accounting.notStarted, 1);
  }
});

test("CLI bounds repeats and requires an output without accepting keys on argv", () => {
  assert.deepEqual(parseReviewArgs(["--out", "result.json", "--runs", "4"]), { live: false, runs: 4, out: "result.json" });
  for (const args of [[], ["--runs", "5", "--out", "a"], ["--runs", "0", "--out", "a"], ["--runs", "1.5", "--out", "a"], ["--out", "a", "--key", "private-cli-canary"]]) assert.throws(() => parseReviewArgs(args));
});

test("CLI defaults offline, refuses existing output before calls, and refuses CI live mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-experiment-"));
  try {
    const out = join(dir, "result.json"), logs = output();
    const io = { env: { TYPESAFE_API_KEY: "synthetic-never-used" }, cwd: dir, provenance, now, ...logs.io, fetch: async () => { assert.fail("offline never calls fetch"); } };
    assert.equal(await main(["--out", out], io), 0);
    const artifact = JSON.parse(await readFile(out, "utf8"));
    assert.equal(artifact.source, "mock");
    assert.equal(artifact.receipts.length, 100);
    assert.equal(artifact.accounting.providerAttempts, 0);
    await writeFile(out, "keep-existing");
    assert.equal(await main(["--live", "--out", out], io), 2);
    assert.equal(await readFile(out, "utf8"), "keep-existing");
    assert.equal(await main(["--live", "--out", join(dir, "ci.json")], { ...io, env: { CI: "true", TYPESAFE_API_KEY: "synthetic-never-used" } }), 2);
    assert.equal(logs.text().includes("synthetic-never-used"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI writes an analyzable partial artifact on cancellation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-experiment-abort-"));
  try {
    const controller = new AbortController(), logs = output(), out = join(dir, "partial.json");
    const result = await main(["--live", "--out", out, "--runs", "4"], { env: { TYPESAFE_API_KEY: "synthetic-test-key" }, provenance, now, signal: controller.signal, ...logs.io, fetch: async () => { controller.abort(); throw Error("private-abort-detail"); } });
    assert.equal(result, 130);
    const artifact = JSON.parse(await readFile(out, "utf8"));
    assert.equal(artifact.status, "cancelled");
    assert.equal(artifact.attempts.length, 1);
    assert.equal(collect([artifact]).skipped, 1);
    assert.equal(logs.text().includes("private-abort-detail"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("concurrent CLI writers reserve the output before any live dispatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-experiment-race-"));
  try {
    let calls = 0;
    const logs = output(), out = join(dir, "single.json");
    const io = { env: { TYPESAFE_API_KEY: "synthetic-test-key" }, provenance, now, ...logs.io, fetch: async () => { calls++; return Response.json(response()); } };
    const results = await Promise.all([main(["--live", "--out", out], io), main(["--live", "--out", out], io)]);
    assert.deepEqual(results.sort(), [0, 2]);
    assert.equal(calls, 43);
    assert.equal(JSON.parse(await readFile(out, "utf8")).attempts.length, 43);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
