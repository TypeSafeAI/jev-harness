import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Manual fixed comparison: host sum-only recovery, all attempts retained; no proposer retry.
const cwd = process.cwd();
const packageRoot = '/tmp/jev-performance-2026-09-24/pinned-package';
const executable = resolve(packageRoot, 'bin/codex');
const expectedCliHash = '0196e89fe5a7598f816ee54232c3d7c26d75e502ab5cfe2c9240e81d90f7255a';
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const packageManifestPath = '/tmp/jev-performance-2026-09-24/pinned-package-manifest.json';
const packageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'));
const packageMatches = () => packageManifest.files.every((entry: {path: string; sha256: string}) => hash(resolve(packageRoot, entry.path)) === entry.sha256) && hash(executable) === expectedCliHash;
if (!packageMatches()) throw Error('Pinned CLI package changed; no run started.');
const supplied = process.argv.slice(2);
if (supplied[0] !== '--source' || !/^[a-f0-9]{40}$/.test(supplied[1] ?? '')) throw Error('An explicit frozen source revision is required.');
const expectedSource = supplied[1]!;
const args = supplied.slice(2);
const prefix = ['--live', '--model', 'gpt-6-sol', '--runs', '3', '--with-prerequisites', '--sum-recovery', '--out'];
if (args.length !== prefix.length + 1 || !prefix.every((arg, index) => args[index] === arg) || !args.at(-1)?.endsWith('.json')) throw Error('Expected the fixed live three-repetition protocol with a fresh JSON output path.');
if (process.env.CI) throw Error('Manual live experiment refused under CI.');
const out = resolve(args.at(-1)!);
const provenancePath = out.replace(/\.json$/, '-provenance.json');
const completionPath = out.replace(/\.json$/, '-completion.json');
if ([out, provenancePath, completionPath].some(existsSync)) throw Error('Choose fresh output paths.');
if (git('status', '--porcelain')) throw Error('Source checkout must be clean and frozen.');
const sourceCommit = git('rev-parse', 'HEAD');
if (sourceCommit !== expectedSource) throw Error('Unexpected frozen recovery source; no run started.');
const files = git('ls-files', 'src', 'examples/host', 'examples/routing', 'examples/arena', 'fixtures', 'scripts/arena-mcp.mjs', 'scripts/experiment-routing.ts', 'package.json', 'pnpm-lock.yaml').split('\n').map(path => ({path, sha256: hash(resolve(cwd, path))}));
const sourceMatches = () => git('rev-parse', 'HEAD') === sourceCommit && !git('status', '--porcelain') && files.every(entry => hash(resolve(cwd, entry.path)) === entry.sha256);
process.env.PATH = resolve(packageRoot, 'bin') + ':' + process.env.PATH;
const provenance = {sourceCommit, clean: true, startedAt: new Date().toISOString(),
  cliVersion: execFileSync(executable, ['--version'], {encoding: 'utf8'}).trim(), cliSha256: expectedCliHash,
  packageManifestSha256: hash(packageManifestPath), packageFiles: packageManifest.files,
  executableResolution: 'codex through pinned PATH; host auth-only copy enabled',
  requestedProposerModel: 'gpt-6-sol', requestedReasoningEffort: 'medium', jevModel: 'jev-1.13.0',
  pairedCasesPlanned: 57, repetitions: 3, providerRequestCap: 171,
  routingTransport: { version: 1, recovery: 'probability_sum_only_v1', maxAttempts: 3, timeoutMs: 45_000 },
  retryScope: 'Only structurally sum-invalid Jev responses may trigger an identical request, max3 total per case. No harness proposer retries; CLI-internal provider attempts are not retained.', argv: supplied,
  runnerSha256: hash(fileURLToPath(import.meta.url)), files,
  concurrency: 'Each configuration alternates paired arms sequentially. Configuration batches may overlap on one host; shared resources and provider variation limit timing conclusions.'};
writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n', {flag: 'wx', mode: 0o600});
let exitCode = 1, artifactValid = false, artifactSha256: string | null = null, providerRequests = 0, stoppedHttpStatus: number | null = null, wrapperFatal: string | null = null;
const dispatches: { index: number; httpStatus: number | null; requestSha256: string; requestBytes: number }[] = [];
const controller = new AbortController();
let interrupted: number | null = null;
const interrupt = () => { interrupted ??= 130; controller.abort(); };
const terminate = () => { interrupted ??= 143; controller.abort(); };
process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
const upstreamFetch = globalThis.fetch;
const measuredFetch: typeof fetch = async (input, init) => {
  if (input !== 'https://api.typesafe.ai/v1/systemone' || typeof init?.body !== 'string' || providerRequests >= 171 || stoppedHttpStatus !== null || controller.signal.aborted) {
    wrapperFatal = 'unexpected_or_excess_dispatch'; controller.abort(); throw Error('Manual request guard stopped dispatch.');
  }
  const dispatch = { index: ++providerRequests, httpStatus: null as number | null, requestSha256: createHash('sha256').update(init.body).digest('hex'), requestBytes: Buffer.byteLength(init.body) };
  dispatches.push(dispatch);
  const response = await upstreamFetch(input, init);
  dispatch.httpStatus = response.status;
  // Abort the entire comparison on account/rate failures; completion distinguishes this
  // from a user cancellation. Partial provider telemetry can remain unknown.
  if ([401, 402, 403, 429].includes(response.status)) { stoppedHttpStatus = response.status; controller.abort(); }
  return response;
};
try {
  const {main} = await import(pathToFileURL(resolve(cwd, 'examples/routing/experiment-cli.ts')).href);
  exitCode = await main(args, {env: process.env, cwd, codexExecutable: 'codex', fetch: measuredFetch, signal: controller.signal, stdout: (s: string) => process.stdout.write(s), stderr: (s: string) => process.stderr.write(s)});
  const { parseExperimentArtifact } = await import(pathToFileURL(resolve(cwd, 'examples/routing/experiment.ts')).href);
  artifactSha256 = hash(out);
  const artifact = await parseExperimentArtifact(JSON.parse(readFileSync(out, 'utf8')));
  if (JSON.stringify(artifact.routingTransport) !== JSON.stringify(provenance.routingTransport) || artifact.routingQuestionSetVersion !== 5 || artifact.fixtureHostRevision !== 1) throw Error('Unexpected measured configuration.');
  const attempts = artifact.trials.flatMap((trial: any) => trial.routing?.attemptLedger?.attempts ?? []);
  if (attempts.length !== providerRequests) throw Error('Physical attempt count mismatch.');
  for (const [index, attempt] of attempts.entries()) {
    if (attempt.requestBytes !== dispatches[index].requestBytes) throw Error('Physical request byte count mismatch.');
    if (attempt.httpStatus !== dispatches[index].httpStatus && !(attempt.httpStatus === null && ['cancelled', 'timeout'].includes(attempt.status))) throw Error('Physical response status mismatch.');
  }
  const routed = artifact.trials.filter((trial: any) => trial.routing !== null);
  let offset = 0;
  for (const trial of routed) {
    const count = trial.routing.attemptLedger?.attempts.length ?? 0;
    const chain = dispatches.slice(offset, offset + count);
    if (chain.some(item => item.requestSha256 !== chain[0].requestSha256)) throw Error('Recovery changed request bytes.');
    offset += count;
  }
  if (routed.some((trial: any) => {
    const routing = trial.routing;
    const cancelledBeforeCall = artifact.status === 'cancelled' && routing.jevCalls === 0 && routing.providerRequests === 0 && routing.observedProviderRequests === 0 && routing.attemptLedger === null;
    return !cancelledBeforeCall && (!routing.attemptLedger || routing.providerRequests !== routing.attemptLedger.attempts.length);
  })) throw Error('Missing physical request telemetry.');
  if (artifact.status === 'complete' && (artifact.trials.length !== 114 || routed.length !== 57)) throw Error('Incomplete fixed batch marked complete.');
  artifactValid = true;
} catch {
  exitCode = 1;
  process.stderr.write('Comparison wrapper failed; retain any partial evidence.\n');
} finally {
  process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
  let runnerUnchanged = false, sourceUnchanged = false, packageUnchanged = false;
  const verificationErrors: string[] = [];
  try { runnerUnchanged = hash(fileURLToPath(import.meta.url)) === provenance.runnerSha256; } catch { verificationErrors.push('runner_verification_failed'); }
  try { sourceUnchanged = sourceMatches(); } catch { verificationErrors.push('source_verification_failed'); }
  try { packageUnchanged = packageMatches(); } catch { verificationErrors.push('package_verification_failed'); }
  if (wrapperFatal || stoppedHttpStatus !== null || !sourceUnchanged || !runnerUnchanged || !packageUnchanged || !artifactValid) exitCode = 1;
  else if (interrupted !== null) exitCode = interrupted;
  writeFileSync(completionPath, JSON.stringify({sourceCommit, finishedAt: new Date().toISOString(), exitCode, artifactValid, artifactSha256, providerRequests, stoppedHttpStatus, wrapperFatal, interrupted, dispatches, verificationErrors, sourceUnchanged, runnerUnchanged, packageUnchanged, artifactPresent: existsSync(out)}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  process.exitCode = sourceUnchanged && runnerUnchanged && packageUnchanged && artifactValid ? exitCode : 1;
}
