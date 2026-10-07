/** Standalone stdio adapter for fixed synthetic fixtures; no provider or CLI calls. */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARENA_CASES } from "../examples/arena/cases";
import { DEMO_CATALOG } from "../examples/routing/scenarios";

const args = process.argv.slice(2);
const fixture = args.length === 2 && args[0] === "--case" ? ARENA_CASES.find(item => item.id === args[1]) : undefined;
if (!fixture) {
  console.error("Usage: pnpm --silent mcp:fixture --case <read|patch|inspect|ambiguous>");
  process.exitCode = 1;
} else {
  const directory = await mkdtemp(join(tmpdir(), "jev-fixture-mcp-"));
  try {
    const manifest = join(directory, "fixture.json"), trace = join(directory, "trace.jsonl");
    await writeFile(manifest, JSON.stringify({ tools: DEMO_CATALOG, files: fixture.files }), { mode: 0o600 });
    await writeFile(trace, "", { mode: 0o600 });
    process.exitCode = await new Promise<number>(resolve => {
      const child = spawn(process.execPath, [fileURLToPath(new URL("./arena-mcp.mjs", import.meta.url)), manifest, trace], { stdio: "inherit" });
      const stop = () => { child.kill("SIGTERM"); };
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      child.on("error", () => { console.error("Fixture MCP could not start. Check the Node installation."); });
      child.on("close", code => {
        process.off("SIGINT", stop); process.off("SIGTERM", stop);
        resolve(code ?? 1);
      });
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
