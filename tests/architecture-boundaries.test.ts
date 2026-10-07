import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { boundaryViolations, checkBoundaries } from "../scripts/check-boundaries.mjs";

test("core dependency inventory permits only pure source, TypeScript libs, and zod", () => {
  const root = resolve(".");
  assert.deepEqual(boundaryViolations([
    "src/index.ts", "src/contract/types.ts", "src/routing/route.ts",
    "node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/lib.dom.d.ts",
    "node_modules/.pnpm/@typescript+typescript-linux-x64@7.0.2/node_modules/@typescript/typescript-linux-x64/lib/lib.es2022.d.ts",
    "node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/index.d.cts",
  ].map(file => resolve(root, file)), root), []);
  for (const file of ["src/audit/receipt.ts", "src/benchmark/index.ts", "examples/host/live.ts", "components/arena.tsx", "node_modules/react/index.d.ts", "node_modules/@types/node/fs.d.ts", "../outside.ts"]) {
    assert.equal(boundaryViolations([resolve(root, file)], root).length, 1, file);
  }
});

test("all current pure entrypoints resolve without host, UI or benchmark dependencies", () => {
  assert.deepEqual(checkBoundaries(), []);
});

test("unresolved Node imports fail core diagnostics even without Node ambient types", async t => {
  const directory = await mkdtemp(resolve(tmpdir(), "jev-boundary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = resolve(directory, "tsconfig.json");
  await writeFile(project, JSON.stringify({
    extends: resolve("tsconfig.core.json"), include: ["forbidden.ts"],
  }));
  await writeFile(resolve(directory, "forbidden.ts"), 'import { readFileSync } from "node:fs"; export const data = readFileSync("private");');
  assert.throws(() => checkBoundaries(project), error => String((error as { stdout?: unknown }).stdout).includes("node:fs"));
});
