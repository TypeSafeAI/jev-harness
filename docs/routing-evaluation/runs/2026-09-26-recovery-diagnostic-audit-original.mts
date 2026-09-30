import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const [artifactPath, outputPath] = process.argv.slice(2);
assert(process.argv.slice(2).length === 2 && artifactPath?.endsWith('.json') && outputPath?.endsWith('.json') && resolve(artifactPath) !== resolve(outputPath));
const hash = (v: string|Buffer) => createHash('sha256').update(v).digest('hex');
const load = (p: string) => import(pathToFileURL(resolve(p)).href);
const [{routeTools}, {jevChoiceBody}, {parseMeasurement}, tasks, {DEMO_POLICY}] = await Promise.all([
 load('src/routing/index.ts'),load('examples/host/jev-choice.ts'),load('examples/routing/measurement.ts'),load('examples/routing/experiment-tasks.ts'),load('examples/routing/scenarios.ts')
]);
const raw=readFileSync(artifactPath), provenanceRaw=readFileSync(artifactPath.replace(/\.json$/, '-provenance.json')), a=JSON.parse(raw.toString()), p=JSON.parse(provenanceRaw.toString());
assert.equal(a.schemaVersion,1); assert.equal(a.kind,'host-recovery-diagnostic');
assert.equal(p.schemaVersion,1); assert.equal(p.kind,'host-recovery-diagnostic-provenance');
assert(['live','scripted-fake'].includes(a.source)); assert.equal(a.source,p.source); assert.equal(p.clean,true);
assert.equal(a.status,'complete'); assert.equal(a.sourceUnchanged,true); assert.equal(a.runnerUnchanged,true);
assert.equal(a.fatalReason,null); assert.deepEqual(a.verificationErrors,[]); assert.equal(a.stoppedHttpStatus,null);
assert(/^[a-f0-9]{40}$/.test(a.sourceCommit)); assert.equal(a.startedAt,p.startedAt);
assert.equal(p.casesPlanned,57); assert.equal(p.repetitions,3); assert.equal(p.requestCap,171); assert.equal(p.proposerCalls,0);
assert.deepEqual(p.terminalHttpStatuses,[401,402,403,429]);
assert.equal(p.argv.length,5); assert.equal(p.argv[0],a.source==='live'?'--live':'--offline');
assert.equal(p.argv[1],'--source'); assert.equal(p.argv[2],a.sourceCommit); assert.equal(p.argv[3],'--out'); assert(p.argv[4].endsWith('.json'));
assert.equal(a.sourceCommit,p.sourceCommit); assert.equal(a.casesRecorded,57); assert.equal(a.casesPlanned,57); assert.equal(a.trials.length,57);
assert.equal(a.requestCap,171); assert.equal(a.proposerCalls,0);
assert.deepEqual(a.routingTransport,{version:1,recovery:'probability_sum_only_v1',maxAttempts:3,timeoutMs:45000});
assert.deepEqual(a.routingTransport,p.routingTransport); assert.deepEqual(a.labels,tasks.EXPERIMENT_LABELS); assert.deepEqual(a.policy,DEMO_POLICY);
assert.equal(p.runnerSha256,hash(readFileSync('/tmp/jev-routing-recovery-diagnostic.mts')));
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),a.sourceCommit); assert.equal(git('status','--porcelain'),'');
const scope=['src','examples/host','examples/routing','examples/arena','fixtures','scripts','package.json','pnpm-lock.yaml'];
assert.deepEqual(p.files.map((f:any)=>f.path),git('ls-files',...scope).split('\n'));
for(const f of p.files){assert.equal(hash(readFileSync(f.path)),f.sha256); assert.equal(hash(execFileSync('git',['show',`${a.sourceCommit}:${f.path}`])),f.sha256);}
const totals:any={cases:0,firstExpected:0,finalExpected:0,physicalRequests:0,extraRequests:0,invalidSumAttempts:0,recoveredCases:0,exhaustedCases:0,attemptReplays:0,outcomes:{},inputTokens:0,outputTokens:0,requestBytes:0,responseBytes:0,missingInput:0,missingOutput:0,missingResponseBytes:0};
const cases:any[]=[];
const attemptStatuses:Record<string,number>={};
let numericEvidenceReplays=0, nullEvidenceReplays=0;
const matches=(receipt:any,label:any)=>receipt.outcome===label.expectedOutcome && (receipt.outcome!=='selected'||receipt.selectedIds.some((id:string)=>label.acceptableIds.includes(id)));
for(const [index,t] of a.trials.entries()){
 const task=tasks.EXPERIMENT_TASKS[index%19], label=tasks.EXPERIMENT_LABELS[task.baseId];
 assert.equal(t.run,Math.floor(index/19)+1); assert.equal(t.taskId,task.id); assert.equal(t.baseId,task.baseId); assert.equal(t.size,task.size);
 const m=parseMeasurement(t.measurement,t.receipt.request.options.map((o:any)=>o.id),t.receipt.evidence), l=m.attemptLedger;
 assert(l?.complete); assert(l.attempts.length>=1 && l.attempts.length<=3); assert.notEqual(l.stopReason,'cancelled'); assert.deepEqual(t.measurement,m); assert.equal(l.recovery,'probability_sum_only_v1'); assert.equal(l.maxAttempts,3); assert.equal(l.timeoutMs,45000);
 assert.equal(t.requestBody,jevChoiceBody(t.receipt.request)); assert.equal(l.attempts.length,t.dispatches.length);
 let first:any=null,final:any=null;
 for(const [i,attempt] of l.attempts.entries()){
  assert.equal(attempt.index,i+1); const d=t.dispatches[i];
  assert.equal(d.index,i+1); assert.equal(d.requestSha256,hash(t.requestBody)); assert.equal(d.requestBytes,Buffer.byteLength(t.requestBody)); assert.equal(d.requestBytes,attempt.requestBytes);
  if(attempt.httpStatus===null && d.httpStatus!==null)assert.equal(attempt.status,'timeout');
  else assert.equal(d.httpStatus,attempt.httpStatus);
  assert(!p.terminalHttpStatuses.includes(d.httpStatus));
  if(i>0)assert.equal(l.attempts[i-1].status,'invalid_sum');
  const q=attempt.projection;
  // Invalid-other projections deliberately omit unexpected keys/values. Replay the
  // host's null-evidence boundary rather than inventing an original raw response.
  const numeric=attempt.status==='valid'||attempt.status==='invalid_sum';
  const evidence=numeric?{model:'jev-1.13.0',choice:q.choice,confidence:q.confidence,probabilities:q.probabilities}:null;
  if(numeric)numericEvidenceReplays++;else nullEvidenceReplays++;
  attemptStatuses[attempt.status]=(attemptStatuses[attempt.status]??0)+1;
  const replay=await routeTools(tasks.EXPERIMENT_CATALOG,{intent:task.intent,availableIds:tasks.TIER_AVAILABLE_IDS[task.size]},DEMO_POLICY,{source:'jev',review:async()=>evidence});
  assert.equal(replay.execution.applied,false); assert.equal(replay.request.model,'jev-1.13.0'); assert.equal(replay.request.questionSetVersion,5);
  assert.deepEqual(replay.request,t.receipt.request);
  if(attempt.status==='invalid_sum'){
   assert.equal(replay.outcome,'unavailable'); assert.equal(replay.evidence,null);
   assert.deepEqual(Object.keys(q.probabilities).sort(),l.optionIds.slice().sort());
   const sum=l.optionIds.reduce((s:number,id:string)=>s+q.probabilities[id],0);
   assert.equal(sum,attempt.diagnostic.probabilitySum); assert(Math.abs(sum-1)>1e-6); totals.invalidSumAttempts++;
  }else if(attempt.status==='valid'){assert.notEqual(replay.evidence,null);assert.equal(i,l.attempts.length-1);}
  else { assert.equal(replay.outcome,'unavailable'); assert.equal(replay.evidence,null); }
  if(i===0)first=replay; final=replay; totals.attemptReplays++;
  totals.physicalRequests++; totals.requestBytes+=attempt.requestBytes;
  for(const [metric,missing] of [['inputTokens','missingInput'],['outputTokens','missingOutput'],['responseBytes','missingResponseBytes']]){if(attempt[metric]===null)totals[missing]++;else totals[metric]+=attempt[metric];}
 }
 assert.deepEqual(final,t.receipt);
 const firstExpected=matches(first,label), finalExpected=matches(final,label);
 totals.cases++; if(firstExpected)totals.firstExpected++; if(finalExpected)totals.finalExpected++;
 totals.extraRequests+=l.attempts.length-1;
 if(l.attempts.length>1&&l.stopReason==='valid')totals.recoveredCases++;
 if(l.stopReason==='exhausted')totals.exhaustedCases++;
 totals.outcomes[final.outcome]=(totals.outcomes[final.outcome]??0)+1;
 cases.push({run:t.run,taskId:t.taskId,attempts:l.attempts.length,firstOutcome:first.outcome,finalOutcome:final.outcome,firstExpected,finalExpected,stopReason:l.stopReason,inputTokens:m.inputTokens,outputTokens:m.outputTokens,attemptsSummary:l.attempts.map((s:any)=>({status:s.status,sum:s.diagnostic?.probabilitySum??null}))});
}
assert.equal(totals.physicalRequests,a.requests); assert(totals.physicalRequests<=171);
const usage={input:{reported:totals.inputTokens,unknownAttempts:totals.missingInput,total:totals.missingInput?null:totals.inputTokens},output:{reported:totals.outputTokens,unknownAttempts:totals.missingOutput,total:totals.missingOutput?null:totals.outputTokens},responseBytes:{reported:totals.responseBytes,unknownAttempts:totals.missingResponseBytes,total:totals.missingResponseBytes?null:totals.responseBytes}};
const result={schemaVersion:1,kind:'host-recovery-diagnostic-audit',status:'pass',source:a.source,sourceCommit:a.sourceCommit,artifactSha256:hash(raw),provenanceSha256:hash(provenanceRaw),auditSha256:hash(readFileSync(fileURLToPath(import.meta.url))),runnerSha256:p.runnerSha256,sourceFilesMatched:p.files.length,checks:['fixed order and all57identities','source and runner byte identity','unchanged tasks labels policy model request body','every attempt replayed through unchanged pure routing: valid/invalid-sum numeric projection, otherwise host null-evidence boundary','every dispatched request reconciled to ledger','no retry after valid response','all failed attempt usage retained'],totals,usage,attemptStatuses,replayCoverage:{numericEvidenceReplays,nullEvidenceReplays},cases,limitations:['Scripted-fake preflights are not live measurements.','Repeated synthetic development cases are not calibration.','No CLI or delivered-output assessment.','Sanitized invalid-other projections are not full raw responses; their host null-evidence boundary is replayed.','Usage totals are provider-reported telemetry; unknown attempt metrics stay explicit. Dispatch counts do not prove billing.','Hashes establish byte identity, not authenticity.']};
writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({path:outputPath,source:a.source,totals}));
