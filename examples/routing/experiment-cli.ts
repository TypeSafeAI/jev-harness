/**
 * CLI for the routing experiment. Offline (scripted fakes) by default.
 * Live mode needs `--live`, TYPESAFE_API_KEY in the environment and a signed-in Codex CLI; it is
 * refused under CI. The key is passed only to the Jev transport and is never printed or stored.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DEMO_POLICY } from "./scenarios.js";
import { EXPERIMENT_LABELS, SIZE_TIERS, type SizeTier } from "./experiment-tasks.js";
import { buildArtifact, codexProposer, fakeProposer, fakeRouterFor, parseExperimentArtifact, runExperiment, type ExperimentDeps } from "./experiment.js";
import { renderExperimentTable } from "./experiment-table.js";
import { createJevChoiceRouter } from "../host/jev-choice.js";

export const USAGE = `Usage:
  pnpm experiment:routing [--runs N] [--sizes small,medium,large] [--top-k K] [--format table|json] [--out FILE]
      Offline: scripted fake Jev and fake proposer. Prints the table (default) or artifact JSON; --out also writes the artifact.
  pnpm experiment:routing --live [--model MODEL] [--runs N] [--sizes ...] [--top-k K] [--out FILE]
      Live: reads TYPESAFE_API_KEY from the environment and runs the Codex CLI arena host.
      Writes examples/routing/runs/<date>-experiment.json (refuses to overwrite) and prints the table.
  pnpm experiment:routing --table FILE
      Render the markdown table from an existing artifact.`;

export interface CliOptions { live: boolean; runs: number; sizes: SizeTier[]; topK: number; format: "table" | "json"; out: string | null; table: string | null; model?: string }

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { live: false, runs: 1, sizes: [...SIZE_TIERS], topK: DEMO_POLICY.topK, format: "table", out: null, table: null };
  const value = (i: number, flag: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) throw Error(`${flag} needs a value.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === "--") continue;
    else if (flag === "--live") options.live = true;
    else if (flag === "--model") { options.model = value(i++, flag); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(options.model)) throw Error("Invalid proposer model identifier."); }
    else if (flag === "--runs") { options.runs = Number(value(i++, flag)); if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 50) throw Error("--runs must be an integer from 1 to 50."); }
    else if (flag === "--top-k") { options.topK = Number(value(i++, flag)); if (!Number.isInteger(options.topK) || options.topK < 1 || options.topK > 20) throw Error("--top-k must be an integer from 1 to 20."); }
    else if (flag === "--sizes") { const sizes = value(i++, flag).split(","); if (!sizes.length || sizes.some(s => !SIZE_TIERS.includes(s as SizeTier)) || new Set(sizes).size !== sizes.length) throw Error("--sizes takes a comma list of small, medium, large."); options.sizes = SIZE_TIERS.filter(s => sizes.includes(s)); }
    else if (flag === "--format") { const f = value(i++, flag); if (f !== "table" && f !== "json") throw Error("--format is table or json."); options.format = f; }
    else if (flag === "--out") options.out = value(i++, flag);
    else if (flag === "--table") options.table = value(i++, flag);
    else throw Error(`Unknown argument: ${flag}`);
  }
  if (options.table && (options.live || options.out || options.model)) throw Error("--table only renders an existing artifact.");
  if (options.model && !options.live) throw Error("--model requires --live; offline runs use the scripted fake proposer.");
  return options;
}

export interface CliIo {
  env: Readonly<Record<string, string | undefined>>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Injected in tests only. Live defaults are the real fetch and the `codex` executable. */
  fetch?: typeof fetch;
  codexExecutable?: string;
  now?: () => Date;
  cwd?: string;
  signal?: AbortSignal;
}

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  let options: CliOptions;
  try { options = parseCliArgs(argv); } catch (error) { io.stderr(`${(error as Error).message}\n\n${USAGE}\n`); return 2; }
  const cwd = io.cwd ?? process.cwd();

  if (options.table) {
    try { io.stdout(renderExperimentTable(await parseExperimentArtifact(JSON.parse(await readFile(resolve(cwd, options.table), "utf8"))))); return 0; }
    catch (error) { io.stderr(`${(error as Error).message}\n`); return 1; }
  }

  let key: string | undefined;
  if (options.live) {
    if (io.env.CI) { io.stderr("Live mode is refused under CI. Automated runs use the offline fakes.\n"); return 2; }
    key = io.env.TYPESAFE_API_KEY?.trim();
    if (!key || key.length > 1024 || !/^[\x21-\x7e]+$/.test(key)) { io.stderr("Live mode needs TYPESAFE_API_KEY in the environment. No request was made.\n"); return 2; }
  }

  const date = (io.now ?? (() => new Date()))();
  const policy = { ...DEMO_POLICY, topK: options.topK };
  const deps: ExperimentDeps = options.live
    ? { source: "live", proposer: codexProposer(io.codexExecutable ?? "codex", options.model), onProgress: line => io.stderr(`${line}\n`),
        routerFor: () => { const jev = createJevChoiceRouter({ key: key!, ...(io.fetch ? { fetch: io.fetch } : {}) }); return { router: jev.router, measurement: () => jev.state.measurement }; } }
    : { source: "fake", proposer: fakeProposer, routerFor: fakeRouterFor };

  if (io.signal) deps.signal = io.signal;

  const command = ["pnpm experiment:routing", ...argv.filter(a => a !== "--")].join(" ");
  const outPath = options.out ?? (options.live ? join("examples", "routing", "runs", `${date.toISOString().slice(0, 10)}-experiment.json`) : null);
  if (outPath) {
    try { await readFile(resolve(cwd, outPath)); io.stderr(`${outPath} already exists; pass --out to choose another path.\n`); return 2; } catch { /* Absent: continue. */ }
  }

  const trials = await runExperiment({ runs: options.runs, sizes: options.sizes, policy }, deps);
  const artifact = buildArtifact(trials, { source: deps.source, command, generatedAt: date.toISOString(), policy, runs: options.runs, sizes: options.sizes,
    proposer: options.live ? options.model ? `codex-cli (requested ${options.model}, reasoning medium, isolated arena host)` : "codex-cli (default model, isolated arena host)" : "fake-scripted", labels: EXPERIMENT_LABELS, status: io.signal?.aborted ? "cancelled" : "complete" });
  const json = JSON.stringify(artifact, null, 2) + "\n";
  if (outPath) {
    await mkdir(dirname(resolve(cwd, outPath)), { recursive: true });
    await writeFile(resolve(cwd, outPath), json, { flag: "wx" });
    io.stderr(`Wrote ${outPath}\n`);
  }
  io.stdout(options.format === "json" && !options.live ? json : renderExperimentTable(artifact));
  return io.signal?.aborted ? 130 : 0;
}

/** CLI lifecycle: abort active provider/child work, await teardown and keep partial evidence. */
export async function runCli(argv: readonly string[], io: Omit<CliIo, "signal">): Promise<number> {
  const controller = new AbortController();
  let interrupted: number | null = null;
  const interrupt = () => { interrupted ??= 130; controller.abort(); };
  const terminate = () => { interrupted ??= 143; controller.abort(); };
  process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
  try { const result = await main(argv, { ...io, signal: controller.signal }); return interrupted ?? result; }
  finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
}
