import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXPERIMENT_CATALOG, EXPERIMENT_LABELS, EXPERIMENT_TASKS } from "../examples/routing/experiment-tasks";
import { buildArtifact, fakeProposer, fakeRouterFor, parseExperimentArtifact, runExperiment } from "../examples/routing/experiment";
import { DEMO_POLICY } from "../examples/routing/scenarios";
import { createRun, parseHistory } from "../examples/arena/history";
import { codexArguments, runCodex } from "../examples/host/codex";

type Input = { name: string; arguments: Record<string, string> };
const at = "2026-09-25T00:00:00Z";
const draft = (path: string, content = "This is deliberately unevaluated source. ☃\n") => ({ name: "draft_test_proposal", arguments: { path, content } });
const search = (query: string) => ({ name: "search_text", arguments: { query } });
const proposalSize = (p: unknown) => Buffer.byteLength(JSON.stringify(p));
async function fixtureHost(t: TestContext, files: Record<string, string>, inputs: Input[]) {
  const directory = await mkdtemp(join(tmpdir(), "jev-fixture-tools-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = join(directory, "manifest.json"), trace = join(directory, "trace.jsonl");
  const original = JSON.stringify({ tools: EXPERIMENT_CATALOG, files });
  await writeFile(manifest, original); await writeFile(trace, "");
  const child = spawn(process.execPath, [resolve("scripts/arena-mcp.mjs"), manifest, trace]);
  let output = ""; child.stdout.on("data", chunk => { output += chunk.toString(); });
  const completed = once(child, "close");
  child.stdin.end(inputs.map((params, i) => JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params })).join("\n") + "\n");
  assert.equal((await completed)[0], 0);
  assert.equal(await readFile(manifest, "utf8"), original, "the source snapshot must remain byte-identical");
  assert.deepEqual((await readdir(directory)).sort(), ["manifest.json", "trace.jsonl"], "no proposed file is written");
  const wires = output.trimEnd().split("\n");
  return { wires, responses: wires.map(line => JSON.parse(line).result), data: wires.map(line => JSON.parse(JSON.parse(line).result.content[0].text)), records: (await readFile(trace, "utf8")).trim().split("\n").map(line => JSON.parse(line)) };
}

test("search reads only supplied files, matches literal case-sensitive text and orders paths and lines", async t => {
  const run = await fixtureHost(t, { "z.ts": "[a.*]\nnone\n[a.*]", "a.ts": "\r\n[a.*]\r\n[A.*]" }, [search("[a.*]"), search("missing"), search("")]);
  assert.deepEqual(run.data[0], { matches: [{ path: "a.ts", line: 2, text: "[a.*]" }, { path: "z.ts", line: 1, text: "[a.*]" }, { path: "z.ts", line: 3, text: "[a.*]" }], truncated: false });
  assert.deepEqual(run.data[1], { matches: [], truncated: false });
  assert.equal(run.responses[2].isError, true);
  assert.match(run.data[2].error, /empty/i);
});

test("search bounds match count and serialized UTF-8 response bytes with explicit truncation", async t => {
  const exact = await fixtureHost(t, { "x.ts": Array(100).fill("hit").join("\n") }, [search("hit")]);
  assert.equal(exact.responses[0].isError, false);
  assert.equal(exact.data[0].matches.length, 100); assert.equal(exact.data[0].truncated, false);
  const excess = await fixtureHost(t, { "x.ts": Array(101).fill("hit").join("\n") }, [search("hit")]);
  assert.equal(excess.data[0].matches.length, 100); assert.equal(excess.data[0].truncated, true);
  const unicode = await fixtureHost(t, { "x.ts": Array(10).fill('hit"' + "測".repeat(4000)).join("\n") }, [search("hit")]);
  assert.ok(unicode.data[0].matches.length > 0 && unicode.data[0].matches.length < 10);
  assert.equal(unicode.data[0].truncated, true);
  assert.ok(Buffer.byteLength(unicode.responses[0].content[0].text) <= 64_000);
  const huge = await fixtureHost(t, { "x.ts": "hit" + "測".repeat(64_000) }, [search("hit")]);
  assert.deepEqual(huge.data[0], { matches: [], truncated: true });
  const overhead = proposalSize({ matches: [{ path: "x.ts", line: 1, text: "" }], truncated: false });
  const boundary = await fixtureHost(t, { "x.ts": "h".repeat(64_000 - overhead) }, [search("h")]);
  assert.equal(Buffer.byteLength(boundary.responses[0].content[0].text), 64_000);
  assert.equal(boundary.data[0].truncated, false);
  const overflow = await fixtureHost(t, { "x.ts": "h".repeat(64_001 - overhead) }, [search("h")]);
  assert.deepEqual(overflow.data[0], { matches: [], truncated: true });
});

test("test drafts retain exact unevaluated source at new bounded test paths and never write it", async t => {
  const paths = ["sum.test.ts", "test/sum.spec.tsx", "test/a.test.js", "a.spec.jsx", "a.test.mjs", "a.spec.cjs", "a.test.mts", "a.spec.cts"];
  const run = await fixtureHost(t, { "src/sum.ts": "synthetic source" }, paths.map(path => draft(path)));
  for (const [i, path] of paths.entries()) {
    assert.equal(run.responses[i].isError, false);
    assert.equal(run.data[i].status, "recorded_pending"); assert.equal(run.data[i].applied, false);
    assert.match(run.data[i].note, /no.*correctness/i);
    assert.deepEqual(run.records[i].testProposal, { ...draft(path).arguments, applied: false });
    assert.equal(run.records[i].proposal, undefined);
  }
  const invalid = ["/a.test.ts", "C:/a.test.ts", "C:a.test.ts", "a\\b.test.ts", "a\u0000.test.ts", "a\u007f.test.ts", "a//b.test.ts", "./a.test.ts", "../a.test.ts", "x/../a.test.ts", "x/./a.test.ts", "a.ts", "a.test.py", ".test.ts", "", "existing.test.ts", "x/" + "a".repeat(16_000) + ".test.ts"];
  const rejected = await fixtureHost(t, { "existing.test.ts": "existing source" }, invalid.map(path => draft(path)));
  assert.ok(rejected.responses.every(r => r.isError));
  assert.ok(rejected.records.every(r => r.status === "rejected" && r.testProposal === undefined));
  const oversized = await fixtureHost(t, {}, [draft("new.test.ts", "x".repeat(16001))]);
  assert.equal(oversized.responses[0].isError, true); assert.equal(oversized.records[0].testProposal, undefined);
});

test("patch and test drafts share the exact serialized budget and reject before retaining excess", async t => {
  const patch = { path: "src/sum.ts", patch: "測".repeat(16000), rationale: "synthetic", applied: false };
  const record = { path: "a.test.ts", content: "x".repeat(16000), applied: false };
  const inputs: Input[] = [{ name: "propose_patch", arguments: { path: patch.path, patch: patch.patch, rationale: patch.rationale } }];
  let bytes = proposalSize(patch);
  while (256_000 - bytes > proposalSize(record)) { inputs.push(draft(record.path, record.content)); bytes += proposalSize(record); }
  const emptySize = proposalSize({ ...record, content: "" });
  const rejectedIndex = inputs.length;
  inputs.push(draft(record.path, record.content), draft(record.path, "x".repeat(256_000 - bytes - emptySize)), draft(record.path, ""));
  const run = await fixtureHost(t, { "src/sum.ts": "synthetic" }, inputs);
  assert.ok(run.responses.slice(0, rejectedIndex).every(r => !r.isError));
  assert.equal(run.responses[rejectedIndex].isError, true);
  assert.equal(run.records[rejectedIndex].testProposal, undefined);
  assert.equal(run.responses[rejectedIndex + 1].isError, false, "a rejected oversized draft must not consume the remaining budget");
  assert.equal(run.responses.at(-1).isError, true);
  assert.match(run.data.at(-1).error, /budget/);
  assert.equal(run.records.at(-1).testProposal, undefined);
  assert.equal(run.records.reduce((total, r) => total + (r.proposal || r.testProposal ? proposalSize(r.proposal ?? r.testProposal) : 0), 0), 256_000);
  const retained = run.records.filter(r => r.status === "returned");
  const artifact = await artifactWithDraft();
  const trial = artifact.trials.find(t => t.taskId === "test_draft-medium" && t.arm === "all_tools")!;
  trial.proposer!.toolCalls = retained; trial.proposer!.calledToolIds = retained.map(r => r.tool); trial.firstToolId = retained[0].tool;
  assert.deepEqual((await parseExperimentArtifact(artifact)).trials.find(t => t === trial)?.proposer?.toolCalls, retained);
  const fixture = EXPERIMENT_TASKS.find(t => t.id === trial.taskId)!;
  const entry = createRun({ id: "budget", startedAt: at, finishedAt: at, fixture: { id: fixture.id, title: "Synthetic budget", task: fixture.intent, files: { ...fixture.files } }, status: "complete", message: "Recorded", lanes: { baseline: { tools: trial.exposedToolIds, result: { status: "completed", answer: "Recorded only", durationMs: 1, inputTokens: null, cachedInputTokens: null, outputTokens: null, toolCallCount: retained.length, traceTruncated: false, toolCalls: retained, error: null } } }, receipt: null, jevUsage: null });
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs[0]?.lanes.baseline?.result.toolCalls, retained);
  const excess = { tool: "draft_test_proposal", status: "returned", at, testProposal: { path: "extra.test.ts", content: "", applied: false as const } };
  trial.proposer!.toolCalls.push(excess); trial.proposer!.calledToolIds.push(excess.tool);
  await assert.rejects(parseExperimentArtifact(artifact), /recorded proposal/);
  entry.lanes.baseline!.result.toolCalls.push(excess); entry.lanes.baseline!.result.toolCallCount++;
  assert.equal(parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs.length, 0);
});

test("unsupported descriptors stay unsupported and existing argument/call limits still apply", async t => {
  const run = await fixtureHost(t, { "x.ts": "hit" }, [
    { name: "list_directory", arguments: { directory: "." } },
    { name: "search_text", arguments: { query: "hit", path: "x.ts" } },
    search("x".repeat(16001)),
    ...Array.from({ length: 98 }, () => search("hit")),
  ]);
  assert.deepEqual(run.data[0], { error: "No handler." });
  assert.ok(run.responses.slice(0, 3).every(r => r.isError));
  assert.equal(run.responses[99].isError, false);
  assert.equal(run.responses[100].isError, true); assert.match(run.data[100].error, /limit/);
});

async function artifactWithDraft() {
  const trials = await runExperiment({ runs: 1, sizes: ["medium"], policy: DEMO_POLICY }, { source: "fake", routerFor: fakeRouterFor, proposer: fakeProposer });
  const artifact = buildArtifact(trials, { source: "fake", command: "pnpm experiment:routing", generatedAt: at, policy: DEMO_POLICY, runs: 1, sizes: ["medium"], proposer: "fake-scripted", labels: EXPERIMENT_LABELS });
  const trial = artifact.trials.find(t => t.taskId === "test_draft-medium" && t.arm === "all_tools")!;
  trial.proposer!.calledToolIds = ["draft_test_proposal"]; trial.firstToolId = "draft_test_proposal";
  trial.proposer!.toolCalls = [{ tool: "draft_test_proposal", status: "returned", at, testProposal: { path: "src/sum.test.ts", content: "unevaluated source", applied: false } } as any];
  return artifact;
}

for (const [name, extra] of [["small unknown field", "unexpected"], ["oversized unknown field", "x".repeat(256001)]] as const) {
  test(`experiment artifacts reject patch records containing ${name}`, async () => {
    const artifact = await artifactWithDraft();
    const trial = artifact.trials.find(t => t.taskId === "test_draft-medium" && t.arm === "all_tools")!;
    trial.proposer!.calledToolIds = ["propose_patch"]; trial.firstToolId = "propose_patch";
    trial.proposer!.toolCalls = [{ tool: "propose_patch", status: "returned", at, proposal: { path: "src/sum.ts", patch: "", rationale: "", applied: false } }];
    assert.deepEqual(await parseExperimentArtifact(structuredClone(artifact)), artifact);
    Object.assign(trial.proposer!.toolCalls[0]!.proposal!, { extra });
    await assert.rejects(parseExperimentArtifact(JSON.parse(JSON.stringify(artifact))), /recorded proposal/);
    delete artifact.fixtureHostRevision;
    await assert.rejects(parseExperimentArtifact(JSON.parse(JSON.stringify(artifact))), /recorded proposal/);
  });

  test(`arena history rejects patch records containing ${name}`, () => {
    const entry = createRun({ id: "patch-fields", startedAt: at, finishedAt: at,
      fixture: { id: "synthetic-patch", title: "Synthetic patch", task: "Record a patch", files: { "src/sum.ts": "synthetic source" } },
      status: "complete", message: "Recorded", receipt: null, jevUsage: null,
      lanes: { baseline: { tools: ["propose_patch"], result: { status: "completed", answer: "Recorded only", durationMs: 1, inputTokens: null, cachedInputTokens: null, outputTokens: null, toolCallCount: 1, traceTruncated: false, error: null,
        toolCalls: [{ tool: "propose_patch", status: "returned", at, proposal: { path: "src/sum.ts", patch: "", rationale: "", applied: false } }] } } } });
    assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs, [entry]);
    Object.assign(entry.lanes.baseline!.result.toolCalls[0]!.proposal!, { extra });
    for (const snapshot of [entry, { ...entry, fixtureHostRevision: undefined }]) {
      const parsed = parseHistory(JSON.stringify({ version: 1, runs: [snapshot] }));
      assert.equal(parsed.runs.length, 0); assert.ok(parsed.error);
    }
  });
}

test("new experiment artifacts retain test drafts with host revision and reject impossible records", async () => {
  const artifact = await artifactWithDraft();
  assert.equal(artifact.fixtureHostRevision, 1);
  assert.deepEqual(await parseExperimentArtifact(JSON.parse(JSON.stringify(artifact))), artifact);
  const invalid = async (edit: (a: any, call: any) => void) => {
    const copy = structuredClone(artifact) as any;
    const call = copy.trials.find((t: any) => t.taskId === "test_draft-medium" && t.arm === "all_tools").proposer.toolCalls[0];
    edit(copy, call); await assert.rejects(parseExperimentArtifact(copy), /Invalid experiment artifact/);
  };
  await invalid(a => { delete a.fixtureHostRevision; });
  await invalid(a => { a.fixtureHostRevision = 2; });
  await invalid((a, c) => { c.status = "rejected"; });
  await invalid((a, c) => { c.testProposal.applied = true; });
  await invalid((a, c) => { c.testProposal.path = "../sum.test.ts"; });
  await invalid((a, c) => { c.testProposal.path = "src/sum.ts"; });
  await invalid((a, c) => { c.testProposal.content = "x".repeat(16001); });
  await invalid((a, c) => { c.testProposal.path = "a".repeat(16000) + ".test.ts"; });
  await invalid((a, c) => { c.testProposal.extra = "unexpected"; });
  await invalid((a, c) => { c.proposal = { path: "src/sum.ts", patch: "", rationale: "", applied: false }; });
  await invalid((a, c) => { delete c.testProposal; });
  await invalid((a, c) => { c.tool = "read_file"; a.trials.find((t: any) => t.proposer?.toolCalls?.[0] === c).proposer.calledToolIds = ["read_file"]; });
  await invalid((a, c) => {
    const p = a.trials.find((t: any) => t.proposer?.toolCalls?.[0] === c).proposer;
    c.testProposal.content = "測".repeat(16000);
    p.toolCalls = Array.from({ length: 6 }, () => structuredClone(c)); p.calledToolIds = Array(6).fill(c.tool);
  });
  const historical = JSON.parse(await readFile("examples/routing/runs/2026-09-23-routing-r3.json", "utf8"));
  assert.equal(historical.fixtureHostRevision, undefined);
  assert.deepEqual(await parseExperimentArtifact(historical), historical);
});

test("arena history retains test source and validates its host provenance, paths and shared budget", () => {
  const fixture = { id: "synthetic-draft", title: "Synthetic draft", task: "Draft only", files: { "src/a.ts": "source", "existing.test.ts": "existing" } };
  const call = { tool: "draft_test_proposal", status: "returned", at, testProposal: { path: "new.test.ts", content: "unevaluated source", applied: false } };
  const entry = createRun({ id: "draft", startedAt: at, finishedAt: at, fixture, status: "complete", message: "Synthetic", lanes: { baseline: { tools: [call.tool], result: { status: "completed", answer: "Recorded only", durationMs: 1, inputTokens: null, cachedInputTokens: null, outputTokens: null, toolCallCount: 1, traceTruncated: false, toolCalls: [call as any], error: null } } }, receipt: null, jevUsage: null });
  assert.deepEqual(entry.lanes.baseline!.result.toolCalls[0]!.testProposal, call.testProposal);
  assert.equal(entry.fixtureHostRevision, 1);
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [entry] })).runs, [entry]);
  const invalid = (edit: (r: any, c: any) => void) => {
    const copy = structuredClone(entry) as any; edit(copy, copy.lanes.baseline.result.toolCalls[0]);
    const parsed = parseHistory(JSON.stringify({ version: 1, runs: [copy] }));
    assert.equal(parsed.runs.length, 0); assert.ok(parsed.error);
  };
  invalid(r => { delete r.fixtureHostRevision; });
  invalid(r => { r.fixtureHostRevision = 2; });
  invalid((r, c) => { c.status = "rejected"; });
  invalid((r, c) => { c.tool = "read_file"; });
  invalid((r, c) => { c.testProposal.path = "existing.test.ts"; });
  invalid((r, c) => { c.testProposal.path = "/new.test.ts"; });
  invalid((r, c) => { c.testProposal.content = "x".repeat(16001); });
  invalid((r, c) => { c.testProposal.applied = true; });
  invalid((r, c) => { delete c.testProposal; });
  invalid((r, c) => { c.proposal = { path: "src/a.ts", patch: "", rationale: "", applied: false }; });
  invalid((r, c) => { c.testProposal.content = "測".repeat(16000); r.lanes.baseline.result.toolCalls = Array(6).fill(c); });
  const old = structuredClone(entry) as any; delete old.fixtureHostRevision; old.lanes.baseline.result.toolCalls = [{ tool: "draft_test_proposal", status: "rejected", at }];
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, runs: [old] })).runs, [old]);
});

test("fake CLI preserves the new trace field and default Arena approvals remain three tools", async t => {
  const directory = await mkdtemp(join(tmpdir(), "jev-fake-draft-cli-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const call = { tool: "draft_test_proposal", status: "returned", at, testProposal: { path: "src/sum.test.ts", content: "unevaluated source", applied: false } };
  const fake = join(directory, "fake-cli");
  await writeFile(fake, `#!/usr/bin/env node\nconst fs = require("node:fs");\nconst arg = process.argv.find(a => a.startsWith("mcp_servers.arena.args="));\nconst [, , trace] = JSON.parse(arg.slice("mcp_servers.arena.args=".length));\nfs.writeFileSync(trace, ${JSON.stringify(JSON.stringify(call) + "\n")});\nprocess.stdin.resume(); process.stdin.on("end", () => console.log(JSON.stringify({type:"turn.completed",usage:{}})));\n`, { mode: 0o700 });
  const fixture = EXPERIMENT_TASKS.find(t => t.baseId === "test_draft")!;
  const result = await runCodex({ task: fixture.intent, files: fixture.files }, EXPERIMENT_CATALOG, new AbortController().signal, fake);
  assert.deepEqual(result.toolCalls, [call]);
  const approvals = codexArguments(directory, "manifest", "trace").filter(a => a.includes('approval_mode="approve"'));
  assert.equal(approvals.length, 3); assert.ok(!approvals.some(a => a.includes("draft_test_proposal") || a.includes("search_text")));
});
