import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Manual synthetic diagnostic. Frozen source; no proposer or proposal execution.
const args = process.argv.slice(2);
assert(args.length === 5 && ['--live', '--offline'].includes(args[0]!) && args[1] === '--attempts' && ['1', '3'].includes(args[2]!) && args[3] === '--out' && args[4]!.endsWith('.json'));
const live = args[0] === '--live', maxAttempts = Number(args[2]);
assert.equal(maxAttempts, 1, 'The v5 wording diagnostic is single-attempt only.');
assert(!live || !process.env.CI, 'Manual live diagnostic cannot run in CI.');
const key = live ? process.env.TYPESAFE_API_KEY?.trim() : 'synthetic-placeholder';
assert(key && key.length <= 1024 && /^[\x21-\x7e]+$/.test(key), 'A host key is required.');
const cwd = process.cwd(), out = resolve(args[4]!);
const provenancePath = out.replace(/\.json$/, '-provenance.json');
assert(!existsSync(out) && !existsSync(provenancePath), 'Choose fresh output paths.');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const git = (...argv: string[]) => execFileSync('git', argv, {cwd, encoding:'utf8'}).trim();
assert(!git('status', '--porcelain'), 'Source must be clean.');
const sourceCommit = git('rev-parse', 'HEAD');
assert.equal(sourceCommit, 'fda2774667872968e1ef48271faa040e435ffdfc', 'Unexpected frozen source revision.');
const files = git('ls-files', 'src', 'examples/host', 'examples/routing', 'package.json', 'pnpm-lock.yaml').split('\n').map(path => ({path, sha256:hash(readFileSync(resolve(cwd,path)))}));
const load = (path: string) => import(pathToFileURL(resolve(cwd,path)).href);
const [{routeTools}, {DEMO_POLICY}, tasks, {createJevChoiceRouter, jevChoiceBody, boundedText}, {fakeRouterFor}] = await Promise.all([
  load('src/routing/index.ts'), load('examples/routing/scenarios.ts'), load('examples/routing/experiment-tasks.ts'), load('examples/host/jev-choice.ts'), load('examples/routing/experiment.ts'),
]);
assert.equal(tasks.EXPERIMENT_TASKS.length, 19, 'Unexpected fixed case count.');
const unit = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const object = (x: unknown): x is Record<string,unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
function sumOnlyFailure(receipt: any, measurement: any): boolean {
  const d = measurement?.diagnostic;
  return receipt.outcome === 'unavailable' && d?.modelMatches === true && d.answerTypeMatches === true && d.confidenceValid === true && d.missingOptions === 0 && d.unexpectedOptions === 0 && d.choiceInSet === true && d.leadingChoice === true && typeof d.probabilitySum === 'number' && Number.isFinite(d.probabilitySum) && Math.abs(d.probabilitySum - 1) > 1e-6;
}
const startedAt = new Date().toISOString();
const plan = {schemaVersion:1, kind:'routing-distribution-diagnostic-provenance', source:live ? 'live' : 'scripted-fake', sourceCommit, clean:true, files, runnerSha256:hash(readFileSync(fileURLToPath(import.meta.url))), startedAt, argv:args, casesPlanned:57, maxAttempts, requestCap:57 * maxAttempts,
  recoveryRule:'No recovery. Exactly one attempt per case; malformed distributions remain unavailable. No probability is changed.',
  retainedWireFields:'SHA256 of response text plus allowlisted choice, unit confidence, unit probabilities for known option ids, and shape flags. Never raw text, unexpected strings/keys, headers, key or exceptions.',
  terminalHttpStatuses:[401,402,403,429], proposerCalls:0, protocol:'Routing v5 wording candidate; 19 unchanged task/catalog combinations, three repetitions, serial requests. Labels joined after provider work. Existing routeTools policy unchanged.'};
writeFileSync(provenancePath, JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
const controller = new AbortController(), interrupt = () => controller.abort();
process.on('SIGINT',interrupt); process.on('SIGTERM',interrupt);
const realFetch = globalThis.fetch, trials: any[] = [];
let failed = false, totalRequests = 0, stoppedHttpStatus: number | null = null;
try {
  outer: for (let run=1; run<=3; run++) for (const [taskIndex, task] of tasks.EXPERIMENT_TASKS.entries()) {
    if (controller.signal.aborted) break outer;
    const attempts: any[] = [];
    let canonicalBody: string | null = null;
    for (let attempt=1; attempt<=maxAttempts; attempt++) {
      if (controller.signal.aborted) break;
      let query: any = null, wire: any = null, requests = 0, httpStatus: number | null = null, requestBody: string | null = null;
      const captureFetch: typeof fetch = async (input, init) => {
        assert(totalRequests < plan.requestCap, 'Diagnostic request cap reached.');
        totalRequests++;
        requests++;
        assert(requests === 1 && typeof init?.body === 'string');
        requestBody = init.body;
        assert.equal(requestBody, jevChoiceBody(query));
        if (canonicalBody === null) canonicalBody = requestBody;
        assert.equal(requestBody, canonicalBody);
        let response: Response;
        if (live) response = await realFetch(input,init);
        else {
          const mocked = await fakeRouterFor(task.id).router.review(query);
          const probabilities = {...mocked.probabilities};
          // Scripted protocol probes: two sum failures then valid; exhausted sum;
          // and wrong model, which must never be retried.
          if ((taskIndex % 3 === 0 && attempt < 3) || taskIndex === 1) for (const id of Object.keys(probabilities)) probabilities[id] *= 0.99;
          response = new Response(JSON.stringify({model:taskIndex === 2 ? 'synthetic-wrong-model' : mocked.model, answers:{tool:{type:'choice',choice:mocked.choice,confidence:taskIndex === 4 ? 0.3 : mocked.confidence,probabilities}},usage:{input_tokens:1,output_tokens:1}}),{status:200});
        }
        httpStatus = response.status;
        if (plan.terminalHttpStatuses.includes(response.status)) stoppedHttpStatus = response.status;
        if (response.ok && response.body) {
          // Consume once; cancelling one branch of a cloned stream can wait on
          // the unconsumed tee branch. Forward the identical decoded text.
          const text = await boundedText(response.body,64_000);
          const raw = JSON.parse(text), a = object(raw?.answers?.tool) ? raw.answers.tool : null;
          const scores = object(a?.probabilities) ? a.probabilities : null;
          const ids = query.options.map((o: any) => o.id);
          wire = {responseSha256:hash(text), modelMatches:raw?.model === query.model, typeMatches:a?.type === 'choice',
            choice:typeof a?.choice === 'string' && ids.includes(a.choice) ? a.choice : null,
            confidence:unit(a?.confidence) ? a.confidence : null,
            probabilities:Object.fromEntries(ids.filter((id: string) => scores && Object.hasOwn(scores,id) && unit(scores[id])).map((id: string) => [id,scores![id]])),
            unexpectedOptions:scores ? Object.keys(scores).filter(id => !ids.includes(id)).length : null};
          return new Response(text,{status:response.status});
        }
        return response;
      };
      const host = createJevChoiceRouter({key,fetch:captureFetch,signal:controller.signal});
      const router = {source:host.router.source,review:async (request: any,signal: AbortSignal) => {query=request; return host.router.review(request,signal);}};
      const receipt = await routeTools(tasks.EXPERIMENT_CATALOG,{intent:task.intent,availableIds:tasks.TIER_AVAILABLE_IDS[task.size]},DEMO_POLICY,router,controller.signal);
      const retryEligible = sumOnlyFailure(receipt,host.state.measurement);
      attempts.push({attempt,requests,httpStatus,requestBody,wire,receipt,measurement:host.state.measurement,hostError:host.state.error,retryEligible});
      if (!retryEligible || controller.signal.aborted || stoppedHttpStatus !== null) break;
    }
    trials.push({run,taskId:task.id,baseId:task.baseId,size:task.size,attempts});
    process.stdout.write(JSON.stringify({run,taskId:task.id,attempts:attempts.length,first:attempts[0]?.receipt.outcome,final:attempts.at(-1)?.receipt.outcome})+'\n');
    if (stoppedHttpStatus !== null) break outer;
  }
} catch { failed = true; }
finally {
  process.off('SIGINT',interrupt); process.off('SIGTERM',interrupt);
  const runnerUnchanged = hash(readFileSync(fileURLToPath(import.meta.url))) === plan.runnerSha256;
  const sourceUnchanged = runnerUnchanged && git('rev-parse','HEAD') === sourceCommit && !git('status','--porcelain') && files.every(f => hash(readFileSync(resolve(cwd,f.path))) === f.sha256);
  const artifact = {schemaVersion:1,kind:'routing-distribution-diagnostic',source:plan.source,sourceCommit,sourceUnchanged,runnerUnchanged,startedAt,finishedAt:new Date().toISOString(),status:failed ? 'failed' : controller.signal.aborted ? 'cancelled' : stoppedHttpStatus !== null ? 'provider_unavailable' : 'complete',stoppedHttpStatus,maxAttempts,casesPlanned:57,casesRecorded:trials.length,requests:totalRequests,proposerCalls:0,labels:tasks.EXPERIMENT_LABELS,policy:DEMO_POLICY,trials,
    limitations:['Routing-only diagnostic; no delivered answer or CLI performance measured.','Every original failure and followup is retained; final-case agreement must be reported separately from per-attempt availability.','Wire projection preserves known numeric fields, not raw provider text or unknown keys.','Repeated synthetic development cases are not held-out calibration.']};
  writeFileSync(out,JSON.stringify(artifact,null,2)+'\n',{flag:'wx',mode:0o600});
  if (failed || !sourceUnchanged) process.exitCode=1;
  else if (controller.signal.aborted) process.exitCode=130;
  else if (stoppedHttpStatus !== null) process.exitCode=1;
}
