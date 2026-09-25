/** Manual review experiment CLI. Offline by default; output is reserved before requests. */
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createReviewHttpTransport } from "../host/review-experiment.js";
import { reviewProvenance, runReviewExperiment, type ReviewProvenance } from "./experiment.js";

export const REVIEW_USAGE = "pnpm exec tsx scripts/experiment-review.ts [--live] [--runs 1..4] --out FILE";
export function parseReviewArgs(argv: readonly string[]) {
  const options = { live: false, runs: 1, out: "" };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === "--") continue;
    if (seen.has(flag)) throw Error("Repeated command option.");
    seen.add(flag);
    if (flag === "--live") options.live = true;
    else if (flag === "--out" || flag === "--runs") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw Error("Command option requires a value.");
      if (flag === "--out") options.out = value;
      else {
        if (!/^[1-4]$/.test(value)) throw Error("--runs must be an integer from 1 to 4.");
        options.runs = Number(value);
      }
    } else throw Error("Unknown command option. Credentials are accepted only from TYPESAFE_API_KEY in the host environment.");
  }
  if (!options.out) throw Error("--out FILE is required; existing files are never overwritten.");
  return options;
}

export interface ReviewCliIo {
  env: Readonly<Record<string, string | undefined>>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  fetch?: typeof fetch;
  cwd?: string;
  signal?: AbortSignal;
  now?: () => string;
  provenance?: ReviewProvenance;
}

export async function main(argv: readonly string[], io: ReviewCliIo): Promise<number> {
  let options: ReturnType<typeof parseReviewArgs>;
  try { options = parseReviewArgs(argv); }
  catch (error) { io.stderr(`${(error as Error).message}\n${REVIEW_USAGE}\n`); return 2; }
  let key: string | undefined;
  if (options.live) {
    if (io.env.CI) { io.stderr("Live mode is refused under CI. Use the offline experiment.\n"); return 2; }
    key = io.env.TYPESAFE_API_KEY?.trim();
    if (!key || key.length > 1024 || !/^[\x21-\x7e]+$/.test(key)) { io.stderr("Live mode requires TYPESAFE_API_KEY in the host environment.\n"); return 2; }
  }
  // Snapshot before reserving output: a new artifact must not change the recorded dirty state.
  const provenance = io.provenance ?? reviewProvenance();
  const path = resolve(io.cwd ?? process.cwd(), options.out);
  let file: Awaited<ReturnType<typeof open>>;
  try { await mkdir(dirname(path), { recursive: true }); file = await open(path, "wx", 0o600); }
  catch { io.stderr("Cannot exclusively create output; choose an absent, writable --out path. No request was made.\n"); return 2; }
  try {
    const host = key ? createReviewHttpTransport({ key, ...(io.fetch ? { fetch: io.fetch } : {}) }) : null;
    const artifact = await runReviewExperiment(options, { source: options.live ? "jev" : "mock", provenance,
      ...(io.signal ? { signal: io.signal } : {}), ...(io.now ? { now: io.now } : {}),
      ...(host ? { transport: host.transport, measurement: () => host.state.measurement } : {}),
    });
    await file.writeFile(JSON.stringify(artifact, null, 2) + "\n", "utf8");
    await file.sync();
    io.stdout(`${options.live ? "LIVE" : "MOCK"} · ${artifact.accounting.plusJevCases}/${artifact.accounting.plannedPlusJevCases} review cases · ${artifact.accounting.transportAttempts} transport attempts · ${artifact.accounting.providerAttempts} provider attempts · ${artifact.status}\n`);
    for (const summary of artifact.summaries) io.stdout(`\nRepetition ${summary.runIndex}\n${summary.table}\n`);
    io.stdout(`${artifact.limitations}\n`);
    return artifact.status === "cancelled" ? 130 : 0;
  } catch { io.stderr("Review experiment or artifact write failed. No retry was made.\n"); return 1; }
  finally { await file.close(); }
}

/** Await active request cancellation and artifact persistence before returning. */
export async function runReviewCli(argv: readonly string[], io: Omit<ReviewCliIo, "signal">): Promise<number> {
  const controller = new AbortController(); let interrupted: number | null = null;
  const interrupt = () => { interrupted ??= 130; controller.abort(); };
  const terminate = () => { interrupted ??= 143; controller.abort(); };
  process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
  try { const result = await main(argv, { ...io, signal: controller.signal }); return interrupted ?? result; }
  finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
}
