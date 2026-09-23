/**
 * Node-only loader for fixtures/proposal-review/*.json. Not re-exported from
 * the pure root or `src/benchmark/index.ts`; import it explicitly.
 *
 * Extracted from TypeSafeAI/typesafe-playground `lib/harness/load.ts` at
 * 6fe5967dc020521a0731682b06c4d8eeeab95ffb. The default directory resolves
 * from this file rather than `process.cwd()`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Fixture } from "../contract/types";
import { parseFixtureSet } from "./fixtures";

export const FIXTURE_DIR = fileURLToPath(new URL("../../fixtures/proposal-review/", import.meta.url));

export function loadFixtures(dir: string = FIXTURE_DIR): Fixture[] {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return parseFixtureSet(
    names.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8"))),
    names,
  );
}
