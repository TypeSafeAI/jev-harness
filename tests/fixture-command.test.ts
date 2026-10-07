import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

async function run(args: string[], messages: unknown[] = []) {
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), resolve("scripts/fixture-mcp.ts"), ...args], { cwd: tmpdir() });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdin.on("error", () => {});
  child.stdin.end(messages.map(message => JSON.stringify(message)).join("\n") + "\n");
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}

test("standalone MCP starts from any directory and returns only fixed synthetic source", async () => {
  const result = await run(["--case", "read"], [
    { jsonrpc: "2.0", id: 1, method: "initialize" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_file", arguments: { path: "src/sum.ts" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "read_file", arguments: { path: "/etc/passwd" } } },
  ]);
  assert.equal(result.code, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(responses[0].result.serverInfo.name, "jev-synthetic-arena");
  assert.deepEqual(responses[1].result.tools.map((tool: { name: string }) => tool.name), ["read_file", "propose_patch", "inspect_agent"]);
  assert.equal(JSON.parse(responses[2].result.content[0].text).source, "synthetic fixture");
  assert.equal(responses[3].result.isError, true);
});

test("standalone MCP rejects missing, unknown and extra arguments clearly", async () => {
  for (const args of [[], ["--case", "private"], ["--case", "read", "--path", "/private"]]) {
    const result = await run(args);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Usage:.*--case/);
  }
});
