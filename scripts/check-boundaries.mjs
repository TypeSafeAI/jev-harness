/** Dependency-direction guard, not a sandbox or proof of runtime purity. */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

/** @param {string[]} files @param {string} repository */
export function boundaryViolations(files, repository = root) {
  return files.filter(file => {
    const path = relative(repository, resolve(file)).split(sep).join("/");
    if (path === "src/index.ts" || /^src\/(contract|routing)\/.+\.ts$/.test(path)) return false;
    // pnpm and conventional node_modules layouts are both supported.
    if (/^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:typescript|@typescript\/typescript-(?:darwin|linux|win32)-(?:arm64|x64|arm))\/lib\/lib\.[^/]+\.d\.ts$/.test(path)) return false;
    if (/^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?zod\/.+\.d\.[cm]?ts$/.test(path)) return false;
    return true;
  }).map(file => relative(repository, file));
}

export function checkBoundaries(project = resolve(root, "tsconfig.core.json")) {
  const compiler = resolve(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  const output = execFileSync(process.execPath, [compiler, "--project", project, "--listFiles", "--noEmit"], {
    cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000,
  });
  const files = output.trim().split(/\r?\n/).filter(Boolean);
  if (!files.length) throw Error("TypeScript returned no dependency inventory.");
  return boundaryViolations(files);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const violations = checkBoundaries();
    if (violations.length) {
      console.error("Pure entrypoints depend on forbidden layers:\n" + violations.map(file => `- ${file}`).join("\n"));
      process.exitCode = 1;
    } else console.log("Core import boundaries passed.");
  } catch (error) {
    console.error("Could not inspect core dependencies. Run pnpm install --frozen-lockfile and check tsconfig.core.json.");
    console.error(error instanceof Error ? error.message : "Compiler failed.");
    process.exitCode = 1;
  }
}
