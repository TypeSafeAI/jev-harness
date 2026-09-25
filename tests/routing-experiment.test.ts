import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { CLARIFICATION_ID, ROUTING_UNTRUSTED_DATA_NOTE, type RoutingRequest } from "../src/routing/index.js";
import { DEMO_POLICY } from "../examples/routing/scenarios.js";
import { EXPERIMENT_CATALOG, EXPERIMENT_LABELS, EXPERIMENT_TASKS, TIER_AVAILABLE_IDS, type ExperimentLabel } from "../examples/routing/experiment-tasks.js";
import { buildArtifact, fakeProposer, fakeRouterFor, parseExperimentArtifact, reportedTotals, runExperiment, scoreTrial, summarizeExperiment, type ExperimentDeps, type Proposer, type ProposerInput, type Trial } from "../examples/routing/experiment.js";
import { renderExperimentTable } from "../examples/routing/experiment-table.js";
import { main, parseCliArgs } from "../examples/routing/experiment-cli.js";
import { codexArguments } from "../examples/host/codex.js";

const meta = (trials: Trial[], labels: Readonly<Record<string, ExperimentLabel>> = EXPERIMENT_LABELS) =>
  buildArtifact(trials, { source: "fake", command: "pnpm experiment:routing", generatedAt: "2026-09-22T00:00:00.000Z", policy: DEMO_POLICY, runs: 1, sizes: ["small", "medium", "large"], proposer: "fake-scripted", labels });
function fakeDeps(capture?: { requests: RoutingRequest[]; inputs: ProposerInput[] }): ExperimentDeps {
  let tick = 0;
  return { source: "fake", now: () => (tick += 5),
    routerFor: taskId => { const handle = fakeRouterFor(taskId); return { measurement: handle.measurement, router: { source: "mock", review: async (request, signal) => { capture?.requests.push(request); return handle.router.review(request, signal); } } }; },
    proposer: { source: "fake", propose: async (input, signal) => { capture?.inputs.push(input); return fakeProposer.propose(input, signal); } } };
}
const collect = () => { let out = "", err = ""; return { io: { stdout: (t: string) => { out += t; }, stderr: (t: string) => { err += t; } }, get out() { return out; }, get err() { return err; } }; };

test("runner pairs both arms per task across catalog sizes and repetitions under fakes", async () => {
  const trials = await runExperiment({ runs: 2, policy: DEMO_POLICY }, fakeDeps());
  assert.equal(trials.length, EXPERIMENT_TASKS.length * 2 * 2);
  assert.deepEqual([...new Set(trials.map(t => t.catalogSize))].sort((a, b) => a - b), [3, 8, 20]);
  for (const task of EXPERIMENT_TASKS) for (const run of [1, 2]) {
    const pair = trials.filter(t => t.taskId === task.id && t.run === run);
    assert.deepEqual(pair.map(t => t.arm).sort(), ["all_tools", "jev_top_k"]);
    assert.deepEqual(pair.map(t => t.order).sort(), [1, 2]);
  }
  // Arm order alternates so neither arm always runs first.
  assert.ok(trials.some(t => t.arm === "all_tools" && t.order === 1) && trials.some(t => t.arm === "jev_top_k" && t.order === 1));
  for (const t of trials.filter(t => t.arm === "all_tools")) {
    assert.equal(t.routing, null);
    assert.deepEqual(t.exposedToolIds, [...TIER_AVAILABLE_IDS[t.size]]);
    assert.equal(t.proxies.jevRequestTokens, 0);
  }
  for (const t of trials.filter(t => t.arm === "jev_top_k")) {
    assert.equal(t.routing!.jevCalls, 1);
    assert.equal(t.routing!.latencyMs, 5);
    assert.equal(t.routing!.source, "mock");
    assert.ok(t.exposedToolIds.length <= DEMO_POLICY.topK);
    assert.ok(t.proxies.jevRequestTokens > 0);
    if (t.routing!.outcome !== "selected") { assert.equal(t.proposer, null); assert.equal(t.outcome, "routed_clarification"); }
  }
  const summary = summarizeExperiment(trials, EXPERIMENT_LABELS);
  assert.equal(summary.byArm.all_tools.jevCalls, 0);
  assert.equal(summary.byArm.jev_top_k.jevCalls, EXPERIMENT_TASKS.length * 2);
  assert.equal(summary.byArm.all_tools.reportedInputMean, null, "fakes report no usage; unknown is not zero");
  assert.equal(summary.byArm.all_tools.reportedUnknown, summary.byArm.all_tools.trials);
  assert.equal(summary.paired.length, EXPERIMENT_TASKS.length);
});

test("labels never reach payloads and only change scoring", async () => {
  for (const task of EXPERIMENT_TASKS) assert.deepEqual(Object.keys(task).sort(), ["baseId", "files", "id", "intent", "size"]);
  const first = { requests: [] as RoutingRequest[], inputs: [] as ProposerInput[] };
  const trials = await runExperiment({ runs: 1, policy: DEMO_POLICY }, fakeDeps(first));
  for (const request of first.requests) {
    assert.equal(request.model, "jev-1.13.0");
    assert.equal(request.untrustedDataNote, ROUTING_UNTRUSTED_DATA_NOTE);
    assert.equal(request.options.at(-1)!.id, CLARIFICATION_ID);
    assert.doesNotMatch(JSON.stringify(request), /acceptable|expected|weights|prefers|estimatedCost/);
  }
  for (const input of first.inputs) {
    assert.deepEqual(Object.keys(input).sort(), ["files", "task", "tools"]);
    assert.ok(Object.isFrozen(input));
    for (const tool of input.tools) assert.deepEqual(Object.keys(tool).sort(), ["description", "id", "inputSchema", "kind"]);
    assert.doesNotMatch(JSON.stringify(input), /acceptable|estimatedCost|expected|weights|prefers/);
  }
  const inverted = Object.fromEntries(Object.entries(EXPERIMENT_LABELS).map(([id, label]) => [id, { acceptableIds: [], expectedOutcome: label.expectedOutcome === "selected" ? "needs_clarification" as const : "selected" as const }]));
  const second = { requests: [] as RoutingRequest[], inputs: [] as ProposerInput[] };
  const again = await runExperiment({ runs: 1, policy: DEMO_POLICY }, fakeDeps(second));
  assert.deepEqual(again, trials);
  assert.deepEqual(second, first);
  const original = meta(trials), relabeled = meta(again, inverted);
  assert.deepEqual(relabeled.trials, original.trials);
  assert.notDeepEqual(relabeled.summary.byArm, original.summary.byArm);
});

test("scoring: acceptable call, clarification, and unavailable routes never fall back to all tools", async () => {
  const deps = fakeDeps();
  const failing: ExperimentDeps = { ...deps, routerFor: () => ({ measurement: () => null, router: { source: "jev", review: async () => { throw Error("synthetic-test-credential outage"); } } }) };
  const trials = await runExperiment({ runs: 1, sizes: ["small"], policy: DEMO_POLICY }, failing);
  for (const t of trials.filter(t => t.arm === "jev_top_k")) {
    assert.equal(t.outcome, "routing_unavailable"); assert.equal(t.proposer, null); assert.deepEqual(t.exposedToolIds, []);
    assert.equal(scoreTrial(t, EXPERIMENT_LABELS[t.baseId]!).correct, false);
    assert.equal(t.routing!.reported, null, "a Jev call with no measurement is unknown usage");
  }
  assert.ok(!JSON.stringify(trials).includes("credential"));
  const broken: ExperimentDeps = { ...deps, proposer: { source: "fake", propose: async () => { throw Error("boom"); } } };
  const failed = await runExperiment({ runs: 1, sizes: ["small"], policy: DEMO_POLICY }, broken);
  assert.ok(failed.filter(t => t.arm === "all_tools").every(t => t.outcome === "proposer_failed"));
  const summary = summarizeExperiment([...trials, ...failed], EXPERIMENT_LABELS);
  assert.equal(summary.byArm.jev_top_k.unavailable, 5);
  assert.ok(summary.byArm.all_tools.failed >= 5);
});

test("reported usage sums proposer and Jev only when both are known", async () => {
  const reporting: Proposer = { source: "codex", propose: async input => ({ status: "completed", calledToolIds: input.tools.slice(0, 1).map(t => t.id), traceTruncated: false, inputTokens: 1000 + input.tools.length, cachedInputTokens: 0, outputTokens: 50, error: null }) };
  const deps: ExperimentDeps = { source: "live", proposer: reporting, routerFor: taskId => { const h = fakeRouterFor(taskId); return { router: h.router, measurement: () => ({ requestBytes: 1, responseBytes: 1, inputTokens: 120, outputTokens: 4, latencyMs: 1 }) }; } };
  const trials = await runExperiment({ runs: 1, sizes: ["large"], policy: DEMO_POLICY }, deps);
  const a = trials.find(t => t.taskId === "read-large" && t.arm === "all_tools")!, b = trials.find(t => t.taskId === "read-large" && t.arm === "jev_top_k")!;
  assert.deepEqual(reportedTotals(a), { input: 1020, output: 50 });
  assert.deepEqual(reportedTotals(b), { input: 1001 + 120, output: 54 });
  const clarified = trials.find(t => t.taskId === "ambiguous-large" && t.arm === "jev_top_k")!;
  assert.deepEqual(reportedTotals(clarified), { input: 120, output: 4 }, "routed clarification pays only for Jev");
  const unknown: Trial = { ...a, proposer: { ...a.proposer!, reported: { input: null, cachedInput: null, output: 50 } } };
  assert.deepEqual(reportedTotals(unknown), { input: null, output: 50 });
});

test("truncated proposer traces keep first-call scoring but exclude unknown correct-tool outcomes", () => {
  const label = EXPERIMENT_LABELS.patch!;
  const truncated: Trial = {
    run: 1, taskId: "patch-small", baseId: "patch", size: "small", catalogSize: 3, arm: "all_tools", order: 1,
    exposedToolIds: ["inspect_agent", "propose_patch"], routing: null,
    proposer: { status: "completed", calledToolIds: ["inspect_agent"], traceTruncated: true, durationMs: 5, reported: { input: null, cachedInput: null, output: null }, error: null },
    outcome: "tool_called", firstToolId: "inspect_agent",
    proxies: { proposerInputTokens: 1, jevRequestTokens: 0, totalInputTokens: 1 },
  };
  assert.equal(scoreTrial(truncated, label).correct, null);
  assert.equal(scoreTrial(truncated, label).firstCallCorrect, false);
  const summary = summarizeExperiment([truncated, { ...truncated, taskId: "patch-small-2", baseId: "patch", proposer: { ...truncated.proposer!, calledToolIds: ["propose_patch"], traceTruncated: false }, firstToolId: "propose_patch" }], { patch: label });
  assert.equal(summary.byArm.all_tools.correct, 1);
  assert.equal(summary.byArm.all_tools.correctKnown, 1);
  assert.equal(summary.byArm.all_tools.correctRate, 1);
});

test("artifact schema round-trips and rejects tampering", async () => {
  const artifact = meta(await runExperiment({ runs: 1, policy: DEMO_POLICY }, fakeDeps()));
  const parsed = await parseExperimentArtifact(JSON.parse(JSON.stringify(artifact)));
  assert.equal(parsed.schemaVersion, 1); assert.equal(parsed.kind, "routing-experiment"); assert.equal(parsed.models.jev, "jev-1.13.0");
  assert.deepEqual(parsed.catalog.ids, EXPERIMENT_CATALOG.map(t => t.id));
  const tamper = (edit: (a: any) => void) => { const copy = structuredClone(artifact) as any; edit(copy); return () => parseExperimentArtifact(copy); };
  await assert.rejects(tamper(a => { a.models.jev = "jev-latest"; }), /model pin/);
  await assert.rejects(tamper(a => { a.schemaVersion = 2; }));
  await assert.rejects(tamper(a => { a.trials[0].outcome = "applied"; }));
  await assert.rejects(tamper(a => { a.trials.find((t: Trial) => t.arm === "all_tools").routing = { jevCalls: 1, latencyMs: 1, reported: null }; }), /mismatch/);
  await assert.rejects(tamper(a => { a.trials[0].proxies.totalInputTokens = -1; }));
  await assert.rejects(tamper(a => { delete a.labels.read; }));
});

test("table is recomputed from trials, labels fake runs and never prints unknown usage as zero", async () => {
  const artifact = meta(await runExperiment({ runs: 1, policy: DEMO_POLICY }, fakeDeps()));
  const table = renderExperimentTable(artifact);
  assert.match(table, /FAKE RUN/);
  assert.match(table, /\| A · all N schemas \| 19 \|/);
  assert.match(table, /unknown \(19\/19\)/);
  assert.equal(table.split("\n").filter(line => /^\| (read|patch|inspect|ambiguous|uncertain|search|test_draft)-/.test(line)).length, EXPERIMENT_TASKS.length);
  const forged = structuredClone(artifact); forged.summary.byArm.all_tools.correct = 999;
  assert.equal(renderExperimentTable(forged), table);
  assert.match(renderExperimentTable({ ...artifact, source: "live" }), /not a calibration/);
});

test("CLI arguments are strict and live mode is gated", async t => {
  assert.equal(parseCliArgs([]).live, false);
  assert.throws(() => parseCliArgs(["--lvie"]), /Unknown/);
  assert.throws(() => parseCliArgs(["--runs", "0"]));
  assert.throws(() => parseCliArgs(["--sizes", "huge"]));
  assert.throws(() => parseCliArgs(["--table", "x.json", "--live"]));
  let fetches = 0;
  const fetch = (async () => { fetches++; throw Error("no network in tests"); }) as typeof globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), "jev-experiment-gate-")); t.after(() => rm(dir, { recursive: true, force: true }));

  const offline = collect();
  assert.equal(await main(["--format", "json"], { ...offline.io, env: { TYPESAFE_API_KEY: "synthetic-test-credential" }, fetch, cwd: dir }), 0);
  assert.equal(JSON.parse(offline.out).source, "fake", "a key in the environment alone never enables live mode");
  const noKey = collect();
  assert.equal(await main(["--live"], { ...noKey.io, env: {}, fetch, cwd: dir }), 2);
  assert.match(noKey.err, /TYPESAFE_API_KEY/);
  const ci = collect();
  assert.equal(await main(["--live"], { ...ci.io, env: { CI: "true", TYPESAFE_API_KEY: "synthetic-test-credential" }, fetch, cwd: dir }), 2);
  assert.match(ci.err, /CI/);
  assert.equal(fetches, 0);
});

test("live mode end to end with fake Jev and fake CLI writes a dated artifact without the key", async t => {
  const dir = await mkdtemp(join(tmpdir(), "jev-experiment-live-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const cli = join(dir, "fake-codex");
  // Fake CLI: reads the fixture manifest and trace from its MCP args, "calls" the first exposed tool, reports usage.
  await writeFile(cli, `#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv[process.argv.indexOf("--model") + 1] !== "gpt-6-sol" || !process.argv.includes('model_reasoning_effort="medium"')) process.exit(2);
const arg = process.argv.find(a => a.startsWith("mcp_servers.arena.args="));
const [, manifest, trace] = JSON.parse(arg.slice("mcp_servers.arena.args=".length));
const tools = JSON.parse(fs.readFileSync(manifest, "utf8")).tools;
process.stdin.resume();
process.stdin.on("end", () => {
  if (tools.length) fs.appendFileSync(trace, JSON.stringify({ tool: tools[0].id, status: "returned", at: new Date(0).toISOString() }) + "\\n");
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Synthetic answer" } }));
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 900 + tools.length, cached_input_tokens: 0, output_tokens: 30 } }));
});
`, { mode: 0o700 });
  const authorizations: string[] = [];
  const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, "jev-1.13.0");
    const ids = Object.keys(sent.questions.tool.criteria);
    assert.equal(ids.at(-1), CLARIFICATION_ID);
    const choice = ids.includes("read_file") ? "read_file" : ids[0]!;
    const probabilities = Object.fromEntries(ids.map(id => [id, id === choice ? 0.9 : 0.1 / (ids.length - 1)]));
    return Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice, confidence: 0.9, probabilities } }, usage: { input_tokens: 150, output_tokens: 3 } });
  }) as typeof globalThis.fetch;
  const run = collect();
  const io = { ...run.io, env: { TYPESAFE_API_KEY: "synthetic-test-credential" }, fetch, codexExecutable: cli, cwd: dir, now: () => new Date("2026-09-22T12:00:00Z") };
  assert.equal(await main(["--live", "--model", "gpt-6-sol", "--sizes", "small"], io), 0);
  const path = join(dir, "examples/routing/runs/2026-09-22-experiment.json");
  const text = await readFile(path, "utf8");
  assert.ok(!text.includes("synthetic-test-credential") && !run.out.includes("synthetic-test-credential") && !run.err.includes("synthetic-test-credential"));
  assert.ok(authorizations.every(value => value === "Bearer synthetic-test-credential"));
  const artifact = await parseExperimentArtifact(JSON.parse(text));
  assert.equal(artifact.source, "live");
  assert.match(artifact.models.proposer, /requested gpt-6-sol, reasoning medium/);
  assert.equal(artifact.trials.length, 10);
  assert.equal(authorizations.length, 5);
  const a = artifact.trials.find(t => t.taskId === "read-small" && t.arm === "all_tools")!;
  assert.deepEqual(a.proposer!.calledToolIds, ["read_file"]);
  assert.deepEqual(reportedTotals(a), { input: 903, output: 30 });
  const b = artifact.trials.find(t => t.taskId === "read-small" && t.arm === "jev_top_k")!;
  assert.deepEqual(b.exposedToolIds, ["read_file"]);
  assert.deepEqual(reportedTotals(b), { input: 901 + 150, output: 33 });
  assert.match(run.out, /Live run/);
  const again = collect();
  assert.equal(await main(["--live", "--sizes", "small"], { ...io, ...again.io }), 2, "an existing dated artifact is never overwritten");
  const rendered = collect();
  assert.equal(await main(["--table", "examples/routing/runs/2026-09-22-experiment.json"], { ...rendered.io, env: {}, cwd: dir }), 0);
  assert.match(rendered.out, /#### Paired per task/);
});

test("Codex approval list defaults to the fixture handlers and only accepts catalog ids", () => {
  const args = codexArguments("/w", "m", "t");
  assert.ok(args.includes('mcp_servers.arena.tools.inspect_agent.approval_mode="approve"'));
  assert.ok(codexArguments("/w", "m", "t", ["search_text"]).includes('mcp_servers.arena.tools.search_text.approval_mode="approve"'));
  assert.throws(() => codexArguments("/w", "m", "t", ['x".approval_mode="approve"']));
});

test("experiment pins the requested proposer model without changing CLI isolation", () => {
  assert.equal(parseCliArgs(["--model", "gpt-6-sol"]).model, "gpt-6-sol");
  const args = codexArguments("/w", "m", "t", ["read_file"], "gpt-6-sol");
  assert.equal(args[args.indexOf("--model") + 1], "gpt-6-sol");
  assert.ok(args.includes("read-only"));
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  assert.throws(() => parseCliArgs(["--model", "bad model"]), /model/);
  assert.throws(() => codexArguments("/w", "m", "t", [], ""), /model/);
});

test("routing diagnostics explain unusable evidence without retaining provider text", async () => {
  const { createJevChoiceRouter } = await import("../examples/host/jev-choice.js");
  const { routeTools } = await import("../src/routing/index.js");
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async () => Response.json({
    model: "unexpected-provider-text", answers: { tool: { type: "choice", choice: "unexpected-provider-text", confidence: 0.8, probabilities: { read_file: 0.8, "unexpected-provider-text": 0.2 } } },
  }) });
  const receipt = await routeTools(EXPERIMENT_CATALOG, { intent: "Read the synthetic file.", availableIds: TIER_AVAILABLE_IDS.small }, DEMO_POLICY, handle.router);
  assert.equal(receipt.outcome, "unavailable");
  assert.deepEqual(handle.state.measurement?.diagnostic, {
    modelMatches: false, answerTypeMatches: true, confidenceValid: true,
    missingOptions: 3, unexpectedOptions: 1, probabilitySum: 1, choiceInSet: false, leadingChoice: false,
  });
  assert.doesNotMatch(JSON.stringify(handle.state), /unexpected-provider-text|synthetic-test-credential/);
});

test("experiment preserves bounded answers and call outcomes for separate quality assessment", async () => {
  const deps = fakeDeps();
  deps.proposer = { source: "fake", async propose(input) {
    const id = input.tools[0]!.id;
    return { status: "completed", calledToolIds: [id], traceTruncated: false, inputTokens: 5, cachedInputTokens: 0, outputTokens: 2, error: null,
      answer: "Synthetic answer", toolCalls: [{ tool: id, status: "rejected", at: "2026-09-24T00:00:00Z" }] };
  } };
  const trials = await runExperiment({ runs: 1, sizes: ["small"], policy: DEMO_POLICY }, deps);
  assert.equal(trials[0]!.proposer?.answer, "Synthetic answer");
  assert.equal(trials[0]!.proposer?.toolCalls?.[0]?.status, "rejected");
  const artifact = buildArtifact(trials, { source: "fake", command: "pnpm experiment:routing", generatedAt: "2026-09-24T00:00:00Z", policy: DEMO_POLICY, runs: 1, sizes: ["small"], proposer: "fake-scripted", labels: EXPERIMENT_LABELS });
  await parseExperimentArtifact(artifact);
  const mismatch = structuredClone(artifact);
  mismatch.trials[0]!.proposer!.toolCalls![0]!.tool = "propose_patch";
  await assert.rejects(parseExperimentArtifact(mismatch), /call trace/);
  const oversized = structuredClone(artifact);
  oversized.trials[0]!.proposer!.answer = "a".repeat(20_001);
  await assert.rejects(parseExperimentArtifact(oversized), /answer/);
});

test("reported input and output retain independent missing-value counts", async () => {
  const trials = await runExperiment({ runs: 1, sizes: ["small"], policy: DEMO_POLICY }, fakeDeps());
  const trial = structuredClone(trials.find(t => t.arm === "all_tools")!);
  trial.proposer!.reported = { input: 100, output: null, cachedInput: 0 };
  const summary = summarizeExperiment([trial], EXPERIMENT_LABELS).byArm.all_tools;
  assert.equal(summary.reportedInputKnown, 1);
  assert.equal(summary.reportedOutputKnown, 0);
  const line = renderExperimentTable(meta([trial])).split("\n").find(line => line.startsWith("| A · all N schemas |"))!;
  assert.match(line, /\| 100 \| unknown \(1\/1\) \|/);
});

test("truncated failed and cancelled attempts remain incorrect in the denominator", async () => {
  const trials = await runExperiment({ runs: 1, sizes: ["small"], policy: DEMO_POLICY }, fakeDeps());
  for (const status of ["failed", "cancelled"] as const) {
    const trial = structuredClone(trials.find(t => t.arm === "all_tools" && t.baseId === "read")!);
    trial.outcome = "proposer_failed"; trial.proposer!.status = status; trial.proposer!.traceTruncated = true;
    assert.equal(scoreTrial(trial, EXPERIMENT_LABELS.read!).correct, false);
    const summary = summarizeExperiment([trial], EXPERIMENT_LABELS).byArm.all_tools;
    assert.equal(summary.correctKnown, 1); assert.equal(summary.correct, 0); assert.equal(summary.failed, 1);
  }
});

test("artifact validation rejects contradictory scoring and non-finite measurements", async () => {
  const artifact = meta(await runExperiment({ runs: 1, policy: DEMO_POLICY }, fakeDeps()));
  const bad = async (edit: (a: any) => void) => { const copy = structuredClone(artifact); edit(copy); await assert.rejects(() => parseExperimentArtifact(copy), /Invalid experiment artifact/); };
  await bad(a => { a.trials.find((t: Trial) => t.outcome === "tool_called").proposer.status = "failed"; });
  await bad(a => { a.trials[0].proxies.totalInputTokens = Infinity; });
  await bad(a => { a.trials.find((t: Trial) => t.proposer).proposer.durationMs = -1; });
  await bad(a => { a.trials[0].firstToolId = "invented"; });
  await bad(a => { a.trials[0].order = 7; });
  await bad(a => { a.trials.push(a.trials[0]); });
  await bad(a => { a.routingQuestionSetVersion = 999; });
  await bad(a => { a.untrustedDataNote = "changed"; });
  await bad(a => { a.models.proposer = null; });
  await bad(a => { a.catalog.ids = []; });
  await bad(a => { a.policy.probabilityFloor = 2; });
  await bad(a => { a.labels.read.acceptableIds = ["not-a-descriptor"]; });
  await bad(a => { a.trials.find((t: Trial) => t.arm === "jev_top_k").routing.outcome = "applied"; });
  await bad(a => { a.trials[0].taskId = "read-large"; });
  await bad(a => { a.trials[0].exposedToolIds = [42]; });
  await bad(a => { a.trials[0].catalogSize = 100; });
  await bad(a => { a.trials = a.trials.slice(0, 1); });
  await bad(a => { a.policy.confidenceFloor = 1; });
  await bad(a => { a.trials.find((t: Trial) => t.routing?.outcome === "selected").routing.jevCalls = 0; });
  await bad(a => { const trial = a.trials.find((t: Trial) => t.outcome === "no_tool_call"); trial.proposer.traceTruncated = true; });
  await bad(a => { const trial = a.trials.find((t: Trial) => t.taskId === "read-small" && t.arm === "jev_top_k"); trial.proposer.calledToolIds = ["inspect_agent"]; trial.firstToolId = "inspect_agent"; });
  const partial = structuredClone(artifact); partial.status = "cancelled"; partial.trials = partial.trials.slice(0, 1);
  assert.equal((await parseExperimentArtifact(partial)).status, "cancelled");
});

test("CLI abort stops further trials and preserves cancelled partial evidence", async t => {
  const dir = await mkdtemp(join(tmpdir(), "jev-experiment-abort-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const controller = new AbortController(); let calls = 0;
  const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls++; const body = JSON.parse(String(init?.body)); const ids = Object.keys(body.questions.tool.criteria);
    controller.abort();
    return Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "read_file", confidence: .9, probabilities: Object.fromEntries(ids.map(id => [id, id === "read_file" ? .9 : .1 / (ids.length - 1)])) } } });
  }) as typeof globalThis.fetch;
  const output = collect();
  const code = await main(["--live", "--sizes", "small", "--out", "cancelled.json"], { ...output.io, env: { TYPESAFE_API_KEY: "synthetic-test-credential" }, fetch, signal: controller.signal, codexExecutable: join(dir, "nonexistent-synthetic-cli"), cwd: dir });
  assert.equal(code, 130); assert.equal(calls, 1);
  const artifact = await parseExperimentArtifact(JSON.parse(await readFile(join(dir, "cancelled.json"), "utf8")));
  assert.equal(artifact.status, "cancelled"); assert.equal(artifact.trials.length, 1); assert.equal(artifact.trials[0]!.proposer, null);
  assert.match(output.out, /Cancelled.*partial/i);
});

test("CLI writes and reads absolute artifact paths", async t => {
  const dir = await mkdtemp(join(tmpdir(), "jev-experiment-path-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "absolute.json"), output = collect();
  assert.equal(await main(["--sizes", "small", "--out", path], { ...output.io, env: {}, cwd: dir }), 0);
  const artifact = await parseExperimentArtifact(JSON.parse(await readFile(path, "utf8")));
  const table = collect();
  assert.equal(await main(["--table", path], { ...table.io, env: {}, cwd: dir }), 0);
  assert.equal(table.out, renderExperimentTable(artifact));
});

test("CLI process signals await detached child cleanup and save partial evidence", { skip: process.platform === "win32" }, async t => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) await t.test(signal, async t => {
    const dir = await mkdtemp(join(tmpdir(), "jev-experiment-signal-"));
    const marker = join(dir, "child.json"), cli = join(dir, "fake-codex"), driver = join(dir, "driver.mjs");
    await writeFile(cli, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, directory: process.cwd() }));
setInterval(() => {}, 1000);
`, { mode: 0o700 });
    await writeFile(driver, `import { runCli } from ${JSON.stringify(pathToFileURL(resolve("examples/routing/experiment-cli.ts")).href)};
const fakeFetch = async (_url, init) => { const ids = Object.keys(JSON.parse(init.body).questions.tool.criteria); return Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "read_file", confidence: .9, probabilities: Object.fromEntries(ids.map(id => [id, id === "read_file" ? .9 : .1 / (ids.length - 1)])) } } }); };
process.exitCode = await runCli(["--live", "--sizes", "small", "--out", "partial.json"], { env: { TYPESAFE_API_KEY: "synthetic-test-credential" }, fetch: fakeFetch, codexExecutable: ${JSON.stringify(cli)}, cwd: ${JSON.stringify(dir)}, stdout: () => {}, stderr: () => {} });
`);
    const child = spawn(process.execPath, ["--import", "tsx", driver], { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] });
    let error = "", observed: { pid: number; directory: string } | null = null;
    child.stderr.on("data", data => { error += String(data); });
    const ended = new Promise<{ code: number | null; signal: string | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
    t.after(async () => { child.kill("SIGKILL"); if (observed) { try { process.kill(-observed.pid, "SIGKILL"); } catch {} } await rm(dir, { recursive: true, force: true }); });
    const deadline = Date.now() + 15_000;
    while (!observed && Date.now() < deadline) { try { observed = JSON.parse(await readFile(marker, "utf8")); } catch { await delay(20); } if (child.exitCode !== null) break; }
    assert.ok(observed, `synthetic child did not start: ${error}`);
    child.kill(signal);
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 10_000);
    const result = await ended; clearTimeout(watchdog);
    assert.deepEqual(result, { code: signal === "SIGINT" ? 130 : 143, signal: null });
    assert.throws(() => process.kill(observed!.pid, 0), { code: "ESRCH" });
    await assert.rejects(stat(observed.directory), { code: "ENOENT" });
    const artifact = await parseExperimentArtifact(JSON.parse(await readFile(join(dir, "partial.json"), "utf8")));
    assert.equal(artifact.status, "cancelled"); assert.equal(artifact.trials.length, 1);
    assert.equal(artifact.trials[0]!.proposer!.status, "cancelled");
  });
});
