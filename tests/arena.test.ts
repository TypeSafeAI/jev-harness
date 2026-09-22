import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { ARENA_CASES } from "../examples/arena/cases";
import { DEMO_CATALOG } from "../examples/routing/scenarios";
import { runCodex, codexArguments } from "../examples/host/codex";

test("synthetic MCP host exposes only selected schemas and refuses unavailable tools/paths", async t => {
  const dir = await mkdtemp(join(tmpdir(), "jev-mcp-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifest = join(dir, "manifest.json"), trace = join(dir, "trace.jsonl");
  await writeFile(manifest, JSON.stringify({ tools: [DEMO_CATALOG[0]], files: ARENA_CASES[0].files }));
  await writeFile(trace, "");
  const child = spawn(process.execPath, [resolve("scripts/arena-mcp.mjs"), manifest, trace]);
  let output = ""; child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stdin.end([
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_file", arguments: { path: "src/sum.ts" } } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_file", arguments: { path: "../../private" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "propose_patch", arguments: {} } },
  ].map(message => JSON.stringify(message)).join("\n") + "\n");
  const [code] = await once(child, "close"); assert.equal(code, 0);
  const responses = output.trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(responses[0].result.tools.map((tool: { name: string }) => tool.name), ["read_file"]);
  assert.equal(responses[1].result.isError, false);
  assert.equal(responses[2].result.isError, true);
  assert.equal(responses[3].result.isError, true);
  assert.equal((await readFile(trace, "utf8")).trim().split("\n").length, 3);
});

test("CLI adapter uses isolated read-only settings and parses real event-shaped usage without provider calls", async t => {
  const dir = await mkdtemp(join(tmpdir(), "jev-cli-test-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const fake = join(dir, "fake-cli");
  await writeFile(fake, '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>{console.log(JSON.stringify({type:"item.started",item:{type:"mcp_tool_call"}}));console.log(JSON.stringify({type:"item.completed",item:{type:"mcp_tool_call"}}));console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"Synthetic answer"}}));console.log(JSON.stringify({type:"turn.completed",usage:{input_tokens:80,cached_input_tokens:20,output_tokens:12}}));});\n', { mode: 0o700 });
  const phases: string[] = [];
  const result = await runCodex(ARENA_CASES[0], DEMO_CATALOG, new AbortController().signal, fake, phase => phases.push(phase));
  assert.deepEqual(phases, ["calling", "working", "answering"]);
  assert.equal(result.status, "completed"); assert.equal(result.answer, "Synthetic answer"); assert.equal(result.inputTokens, 80); assert.equal(result.cachedInputTokens, 20); assert.deepEqual(result.toolCalls, []);
  const args = codexArguments(dir, "fixture", "trace");
  assert.ok(args.includes("read-only")); assert.ok(args.includes("--ignore-user-config")); assert.ok(args.includes("shell_tool")); assert.ok(!args.some(arg => arg.includes("dangerously")));
  assert.ok(args.includes('mcp_servers.arena.default_tools_approval_mode="prompt"'));
  assert.ok(args.includes('mcp_servers.arena.tools.read_file.approval_mode="approve"'));
  assert.ok(args.includes('mcp_servers.arena.required=true'));
  const missing = await runCodex(ARENA_CASES[0], [], new AbortController().signal, join(dir, "missing"));
  assert.equal(missing.status, "failed"); assert.equal(missing.inputTokens, null);
});

test("arena starts both lanes before either finishes and waits for a remaining lane after failure", async () => {
  const { runArenaLanes } = await import("../examples/host/arena-lanes");
  const events: any[] = [], releases: (() => void)[] = [], started: string[][] = [];
  const fake: typeof runCodex = async (_fixture, tools, _signal, _executable, progress) => {
    started.push(tools.map(tool => tool.id));
    progress?.("working");
    await new Promise<void>((resolve, reject) => releases.push(started.length === 1 ? () => reject(Error("synthetic failure")) : resolve));
    return { status: "completed", answer: "Fixture answer", durationMs: 10, inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, toolCallCount: 0, traceTruncated: false, toolCalls: [], error: null };
  };
  let ended = false;
  const pending = runArenaLanes(ARENA_CASES[0], ["read_file"], new AbortController().signal, event => events.push(event), fake).finally(() => { ended = true; });
  const rejection = assert.rejects(pending, /CLI lane failed/);
  assert.equal(started.length, 2, "both processes start without awaiting the first");
  assert.deepEqual(started[0], DEMO_CATALOG.map(tool => tool.id)); assert.deepEqual(started[1], ["read_file"]);
  releases[0]!(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ended, false, "the second process still owns the host slot");
  releases[1]!(); await rejection;
  assert.ok(events.some(e => e.type === "lane" && e.lane === "baseline" && e.phase === "failed"));
  assert.ok(events.some(e => e.type === "result" && e.lane === "integrated"));
});

test("agent prompt shares task and paths but keeps source contents behind MCP", async () => {
  const { arenaPrompt } = await import("../examples/host/codex");
  for (const fixture of ARENA_CASES) {
    const prompt = arenaPrompt(fixture);
    assert.ok(prompt.includes(fixture.task));
    for (const [path, content] of Object.entries(fixture.files)) { assert.ok(prompt.includes(path)); assert.ok(!prompt.includes(content.trim())); }
    assert.match(prompt, /do not invent file contents/);
  }
});

test("MCP retains bounded pending proposals for inspection and rejects excess recordings", async t => {
  const dir = await mkdtemp(join(tmpdir(), "jev-proposal-test-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const manifest = join(dir, "manifest.json"), trace = join(dir, "trace.jsonl");
  const fixture = ARENA_CASES[1];
  await writeFile(manifest, JSON.stringify({ tools: DEMO_CATALOG, files: fixture.files })); await writeFile(trace, "");
  const child = spawn(process.execPath, [resolve("scripts/arena-mcp.mjs"), manifest, trace]);
  let output = ""; child.stdout.on("data", chunk => { output += chunk.toString(); });
  const args = { path: "src/sum.ts", patch: "synthetic-pending-diff\n" + "x".repeat(15900), rationale: "synthetic rationale " + "y".repeat(15900) };
  child.stdin.end(Array.from({ length: 10 }, (_, id) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "propose_patch", arguments: args } })).join("\n") + "\n");
  const [code] = await once(child, "close"); assert.equal(code, 0);
  const responses = output.trim().split("\n").map(line => JSON.parse(line));
  const records = (await readFile(trace, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(records[0].proposal, { ...args, applied: false });
  assert.equal(JSON.parse(responses[0].result.content[0].text).status, "recorded_pending");
  assert.equal(records.at(-1).status, "rejected"); assert.equal(records.at(-1).proposal, undefined);
  assert.equal(responses.at(-1).result.isError, true);
  assert.ok(records.reduce((total, record) => total + (record.proposal ? Buffer.byteLength(JSON.stringify(record.proposal)) : 0), 0) <= 256_000);
  assert.deepEqual(JSON.parse(await readFile(manifest, "utf8")).files, fixture.files);
});

test("Windows CLI host refuses before workspace/auth/process setup", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    const result = await runCodex(ARENA_CASES[0], [], new AbortController().signal, "must-not-spawn");
    assert.equal(result.status, "failed"); assert.equal(result.durationMs, 0); assert.match(result.error!, /macOS or Linux/);
  } finally { Object.defineProperty(process, "platform", descriptor); }
});
