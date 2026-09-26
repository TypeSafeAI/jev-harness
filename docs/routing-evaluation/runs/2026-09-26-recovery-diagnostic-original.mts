import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Manual fixed synthetic experiment. Never imports or executes proposed source.
const args = process.argv.slice(2);
assert(args.length === 5 && ['--live', '--offline'].includes(args[0]!) && args[1] === '--source' && /^[a-f0-9]{40}$/.test(args[2]!) && args[3] === '--out' && args[4]!.endsWith('.json'));
const live = args[0] === '--live', expectedSource = args[2]!;
assert(!live || !process.env.CI, 'Live measurement is manual only.');
const key = live ? process.env.TYPESAFE_API_KEY?.trim() : 'synthetic-placeholder';
assert(key && key.length <= 1024 && /^[\x21-\x7e]+$/.test(key), 'A host key is required.');
const cwd = process.cwd(), out = resolve(args[4]!);
const provenancePath = out.replace(/\.json$/, '-provenance.json');
assert(!existsSync(out) && !existsSync(provenancePath), 'Use fresh output paths.');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const git = (...argv: string[]) => execFileSync('git', argv, { cwd, encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain'), '', 'Source must be clean.');
assert.equal(git('rev-parse', 'HEAD'), expectedSource, 'Unexpected source revision.');
const sourceFiles = git('ls-files', 'src', 'examples/host', 'examples/routing', 'examples/arena', 'fixtures', 'scripts', 'package.json', 'pnpm-lock.yaml').split('\n').map(path => ({ path, sha256: hash(readFileSync(resolve(cwd, path))) }));
const load = (path: string) => import(pathToFileURL(resolve(cwd, path)).href);
const [{ routeTools }, { DEMO_POLICY }, tasks, { createJevChoiceRouter, jevChoiceBody }, { fakeRouterFor }, { parseMeasurement }] = await Promise.all([
  load('src/routing/index.ts'), load('examples/routing/scenarios.ts'), load('examples/routing/experiment-tasks.ts'), load('examples/host/jev-choice.ts'), load('examples/routing/experiment.ts'), load('examples/routing/measurement.ts'),
]);
assert.equal(tasks.EXPERIMENT_TASKS.length, 19);
const recovery = 'probability_sum_only_v1', requestCap = 57 * 3;
const plan = {
  schemaVersion: 1, kind: 'host-recovery-diagnostic-provenance', source: live ? 'live' : 'scripted-fake',
  sourceCommit: expectedSource, clean: true, files: sourceFiles,
  runnerSha256: hash(readFileSync(fileURLToPath(import.meta.url))), startedAt: new Date().toISOString(), argv: args,
  routingTransport: { version: 1, recovery, maxAttempts: 3, timeoutMs: 45_000 },
  casesPlanned: 57, repetitions: 3, requestCap, proposerCalls: 0,
  terminalHttpStatuses: [401, 402, 403, 429],
  protocol: 'Same 19 tasks three times in fixed order. One host router invocation per case; at most three identical physical requests under one host deadline. Labels joined after provider work. All attempts, failures and costs retained.',
  limitations: ['Repeated development cases, not held-out calibration.', 'No CLI, delivered answer, proposed-source execution or isolated speed measurement.', 'Physical count means host dispatch attempts, not proof of provider billing.'],
};
writeFileSync(provenancePath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const controller = new AbortController(), interrupt = () => controller.abort();
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
const providerFetch = globalThis.fetch;
const trials: any[] = [];
let requests = 0, stoppedHttpStatus: number | null = null, failed = false, fatalReason: string | null = null;
function guard(condition: unknown, code: string): asserts condition {
  if (!condition) { fatalReason ??= code; throw Error('Wrapper invariant failed.'); }
}
try {
  outer: for (let run = 1; run <= 3; run++) for (const [index, task] of tasks.EXPERIMENT_TASKS.entries()) {
    if (controller.signal.aborted) break outer;
    let query: any = null, canonicalBody: string | null = null, canonicalSignal: AbortSignal | null | undefined;
    const dispatches: any[] = [];
    const captureFetch: typeof fetch = async (input, init) => {
      guard(!fatalReason && stoppedHttpStatus === null, 'dispatch_after_stop');
      guard(requests < requestCap, 'global_request_cap');
      guard(dispatches.length < 3, 'case_request_cap');
      guard(!controller.signal.aborted, 'dispatch_after_cancel');
      guard(typeof init?.body === 'string', 'request_body_type');
      const body = init!.body as string;
      guard(body === jevChoiceBody(query), 'unexpected_request_body');
      if (!dispatches.length) { canonicalBody = body; canonicalSignal = init?.signal; }
      guard(body === canonicalBody, 'changed_request_body');
      guard(init?.signal === canonicalSignal, 'changed_deadline_signal');
      guard(canonicalSignal && !canonicalSignal.aborted, 'dispatch_after_deadline');
      const dispatch = { index: dispatches.length + 1, requestSha256: hash(body), requestBytes: Buffer.byteLength(body), httpStatus: null as number | null };
      dispatches.push(dispatch); requests++;
      let response: Response;
      if (live) response = await providerFetch(input, init);
      else {
        const mocked = await fakeRouterFor(task.id).router.review(query);
        const probabilities = { ...mocked.probabilities };
        if ((index % 5 === 0 && dispatch.index < 3) || index === 2) for (const id of Object.keys(probabilities)) probabilities[id] *= 0.99;
        response = new Response(JSON.stringify({ model: index === 1 ? 'synthetic-wrong-model' : mocked.model, answers: { tool: { type: 'choice', choice: mocked.choice, confidence: index === 4 ? 0.3 : mocked.confidence, probabilities } }, usage: { input_tokens: 10, output_tokens: 2 } }));
      }
      dispatch.httpStatus = response.status;
      if (plan.terminalHttpStatuses.includes(response.status)) stoppedHttpStatus = response.status;
      return response;
    };
    const host = createJevChoiceRouter({ key, recovery, fetch: captureFetch, signal: controller.signal, timeoutMs: 45_000 });
    const router = { source: host.router.source, review: async (request: any, signal: AbortSignal) => { query = request; return host.router.review(request, signal); } };
    const receipt = await routeTools(tasks.EXPERIMENT_CATALOG, { intent: task.intent, availableIds: tasks.TIER_AVAILABLE_IDS[task.size] }, DEMO_POLICY, router, controller.signal);
    trials.push({ run, taskId: task.id, baseId: task.baseId, size: task.size, requestBody: canonicalBody, dispatches, receipt, measurement: host.state.measurement, hostError: host.state.error });
    if (fatalReason) { failed = true; break outer; }
    if (!query) { assert(controller.signal.aborted && dispatches.length === 0 && host.state.measurement === null); break outer; }
    // Caller cancellation can withhold a valid returned response from the receipt.
    const measurement = parseMeasurement(host.state.measurement, query.options.map((o: any) => o.id), controller.signal.aborted && receipt.evidence === null ? undefined : receipt.evidence);
    const ledger = measurement.attemptLedger;
    assert(ledger && ledger.complete && ledger.recovery === recovery && ledger.maxAttempts === 3 && ledger.timeoutMs === 45_000);
    assert.equal(ledger.attempts.length, dispatches.length);
    for (const [i, attempt] of ledger.attempts.entries()) {
      assert.equal(attempt.index, dispatches[i].index);
      assert.equal(attempt.requestBytes, dispatches[i].requestBytes);
      if (attempt.httpStatus === null && dispatches[i].httpStatus !== null) assert(['cancelled', 'timeout'].includes(attempt.status));
      else assert.equal(attempt.httpStatus, dispatches[i].httpStatus);
      assert.notEqual(attempt.status, 'pending');
      if (i > 0) assert.equal(ledger.attempts[i - 1].status, 'invalid_sum');
    }
    assert.equal(measurement.requestBytes, dispatches.reduce((n: number, d: any) => n + d.requestBytes, 0));
    for (const metric of ['inputTokens', 'outputTokens', 'responseBytes']) {
      const values = ledger.attempts.map((a: any) => a[metric]);
      assert.equal(measurement[metric], values.some((v: any) => v === null) ? null : values.reduce((n: number, v: number) => n + v, 0));
    }
    if (!live && !controller.signal.aborted) {
      const exhausted = index === 2, wrongModel = index === 1, recovered = index % 5 === 0;
      assert.equal(dispatches.length, exhausted || recovered ? 3 : 1);
      assert.equal(ledger.attempts[0].status, exhausted || recovered ? 'invalid_sum' : wrongModel ? 'invalid_other' : 'valid');
      assert.equal(ledger.attempts.at(-1).status, exhausted ? 'invalid_sum' : wrongModel ? 'invalid_other' : 'valid');
      assert.equal(ledger.stopReason, exhausted ? 'exhausted' : wrongModel ? 'failure' : 'valid');
      assert.equal(measurement.inputTokens, dispatches.length * 10);
      assert.equal(measurement.outputTokens, dispatches.length * 2);
      if (index === 4) assert.equal(receipt.outcome, 'needs_clarification');
    }
    process.stdout.write(JSON.stringify({ run, taskId: task.id, requests: dispatches.length, outcome: receipt.outcome }) + '\n');
    if (stoppedHttpStatus !== null) break outer;
  }
  if (!live && !controller.signal.aborted) { assert.equal(trials.length, 57); assert.equal(requests, 87); }
} catch { failed = true; }
finally {
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  let runnerUnchanged = false, sourceUnchanged = false;
  const verificationErrors: string[] = [];
  try { runnerUnchanged = hash(readFileSync(fileURLToPath(import.meta.url))) === plan.runnerSha256; } catch { verificationErrors.push('runner_verification_failed'); }
  try { sourceUnchanged = git('rev-parse', 'HEAD') === expectedSource && !git('status', '--porcelain') && sourceFiles.every(file => hash(readFileSync(resolve(cwd, file.path))) === file.sha256); } catch { verificationErrors.push('source_verification_failed'); }
  const artifact = { schemaVersion: 1, kind: 'host-recovery-diagnostic', source: plan.source, sourceCommit: expectedSource, sourceUnchanged, runnerUnchanged,
    startedAt: plan.startedAt, finishedAt: new Date().toISOString(), routingTransport: plan.routingTransport,
    fatalReason, verificationErrors, status: failed || !sourceUnchanged || !runnerUnchanged ? 'failed' : controller.signal.aborted ? 'cancelled' : stoppedHttpStatus !== null ? 'provider_unavailable' : 'complete', stoppedHttpStatus,
    casesPlanned: 57, casesRecorded: trials.length, requests, requestCap, proposerCalls: 0, labels: tasks.EXPERIMENT_LABELS, policy: DEMO_POLICY, trials, limitations: plan.limitations };
  writeFileSync(out, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (failed || !sourceUnchanged || !runnerUnchanged) process.exitCode = 1;
  else if (controller.signal.aborted) process.exitCode = 130;
  else if (stoppedHttpStatus !== null) process.exitCode = 1;
}
