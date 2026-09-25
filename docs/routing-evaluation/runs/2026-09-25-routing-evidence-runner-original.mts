import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Manual development diagnostic only. No proposer, fixture execution or retry.
const args = process.argv.slice(2);
if (args.length !== 3 || !['--live', '--offline'].includes(args[0]!) || args[1] !== '--out') {
  throw Error('Usage: --live|--offline --out FILE');
}
const live = args[0] === '--live';
if (live && process.env.CI) throw Error('Live diagnostic refused under CI.');
const key = process.env.TYPESAFE_API_KEY?.trim();
if (live && (!key || key.length > 1024 || !/^[\x21-\x7e]+$/.test(key))) throw Error('Live diagnostic needs a host key.');
const out = resolve(args[2]!);
const provenancePath = out.replace(/\.json$/, '') + '-provenance.json';
if (existsSync(out) || existsSync(provenancePath)) throw Error('Choose new output paths.');
const cwd = process.cwd();
const git = (...argv: string[]) => execFileSync('git', argv, { cwd, encoding: 'utf8' }).trim();
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
if (git('status', '--porcelain')) throw Error('Source must be clean and frozen.');
const sourceCommit = git('rev-parse', 'HEAD');
const paths = git('ls-files', 'src', 'examples/host', 'examples/routing', 'package.json', 'pnpm-lock.yaml').split('\n');
const files = paths.map(path => ({ path, sha256: sha256(readFileSync(resolve(cwd, path))) }));
const unchanged = () => git('rev-parse', 'HEAD') === sourceCommit && !git('status', '--porcelain') && files.every(f => sha256(readFileSync(resolve(cwd, f.path))) === f.sha256);
const load = (path: string) => import(pathToFileURL(resolve(cwd, path)).href);
const [{ routeTools }, { DEMO_POLICY }, tasks, { createJevChoiceRouter, jevChoiceBody }, { fakeRouterFor }] = await Promise.all([
  load('src/routing/index.ts'), load('examples/routing/scenarios.ts'), load('examples/routing/experiment-tasks.ts'),
  load('examples/host/jev-choice.ts'), load('examples/routing/experiment.ts'),
]);
const startedAt = new Date().toISOString();
const provenance = { schemaVersion: 1, kind: 'routing-evidence-diagnostic-provenance', sourceCommit, clean: true, files,
  scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), nodeVersion: process.version, argv: args,
  source: live ? 'live' : 'scripted-fake', startedAt, repetitions: 3, casesPlanned: tasks.EXPERIMENT_TASKS.length * 3,
  proposer: null, retries: 0, limitation: 'Routing evidence only; no CLI call, final answer, task completion or proposer cost is measured.' };
writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
const trials: any[] = [];
let fatal = false;
try {
  outer: for (let run = 1; run <= 3; run++) for (const task of tasks.EXPERIMENT_TASKS) {
    if (controller.signal.aborted) break outer;
    const host = live ? createJevChoiceRouter({ key, signal: controller.signal }) : null;
    const underlying = host?.router ?? fakeRouterFor(task).router;
    let requestBody: string | null = null;
    let calls = 0;
    const router = { source: underlying.source, review: async (request: any, signal: AbortSignal) => {
      requestBody = jevChoiceBody(request); calls++;
      return underlying.review(request, signal);
    } };
    const receipt = await routeTools(tasks.EXPERIMENT_CATALOG,
      { intent: task.intent, availableIds: tasks.TIER_AVAILABLE_IDS[task.size] }, DEMO_POLICY, router, controller.signal);
    trials.push({ run, taskId: task.id, baseId: task.baseId, size: task.size, calls, requestBody, receipt,
      measurement: host?.state.measurement ?? null, hostError: host?.state.error ?? null });
    process.stdout.write(JSON.stringify({ run, taskId: task.id, outcome: receipt.outcome, selectedIds: receipt.selectedIds }) + '\n');
  }
} catch {
  // Never retain provider exception text or credential-bearing environment values.
  fatal = true;
} finally {
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  const sourceUnchanged = unchanged();
  const artifact = { schemaVersion: 1, kind: 'routing-evidence-diagnostic', source: live ? 'live' : 'scripted-fake', startedAt,
    finishedAt: new Date().toISOString(), status: fatal ? 'failed' : controller.signal.aborted ? 'cancelled' : 'complete', sourceCommit, sourceUnchanged,
    policy: DEMO_POLICY, repetitions: 3, casesPlanned: tasks.EXPERIMENT_TASKS.length * 3, casesRecorded: trials.length,
    calls: trials.reduce((sum, trial) => sum + trial.calls, 0), retries: 0, proposerCalls: 0,
    labels: tasks.EXPERIMENT_LABELS, trials,
    limitations: ['Routing-only diagnostic, not a paired task-output benchmark.', 'All outcomes retained; no automatic retry.', 'Labels joined only after provider work.', 'Adaptive synthetic development; repeated tasks are not held-out calibration.'] };
  writeFileSync(out, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (!sourceUnchanged || fatal) process.exitCode = 1;
  else if (controller.signal.aborted) process.exitCode = 130;
}
