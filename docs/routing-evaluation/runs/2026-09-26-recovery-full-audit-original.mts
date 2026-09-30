import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Read-only validation and pure replay. Never invoke a provider, proposer, or retained source.
globalThis.fetch=async()=>{throw Error('Network transport forbidden in offline audit.');};
const [artifactPath,outputPath]=process.argv.slice(2);
assert(process.argv.slice(2).length===2 && artifactPath?.endsWith('.json') && outputPath?.endsWith('.json') && resolve(artifactPath)!==resolve(outputPath));
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const read=(path:string)=>readFileSync(path);
const json=(path:string)=>JSON.parse(read(path).toString());
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
const load=(path:string)=>import(pathToFileURL(resolve(path)).href);
const [routing,experiment,tasks,{DEMO_POLICY},{jevChoiceBody},measurement,{arenaPrompt}]=await Promise.all([
 load('src/routing/index.ts'),load('examples/routing/experiment.ts'),load('examples/routing/experiment-tasks.ts'),load('examples/routing/scenarios.ts'),load('examples/host/jev-choice.ts'),load('examples/routing/measurement.ts'),load('examples/host/codex.ts')
]);
const provenancePath=artifactPath.replace(/\.json$/,'-provenance.json'),completionPath=artifactPath.replace(/\.json$/,'-completion.json');
const raw=read(artifactPath), input=JSON.parse(raw.toString()),p=json(provenancePath),c=json(completionPath);
const before=JSON.stringify(input),a=await experiment.parseExperimentArtifact(input);
assert.equal(JSON.stringify(input),before);assert.deepEqual(a,input);
assert.equal(a.status,'complete');assert.equal(a.source,'live');assert.equal(a.trials.length,114);assert.equal(a.runs,3);assert.deepEqual(a.sizes,['small','medium','large']);
assert.equal(a.routingQuestionSetVersion,5);assert.equal(a.fixtureHostRevision,1);assert.equal(a.models.jev,'jev-1.13.0');
assert.equal(a.models.proposer,'codex-cli (requested gpt-6-sol, reasoning medium, isolated arena host)');
assert.deepEqual(a.routingTransport,{version:1,recovery:'probability_sum_only_v1',maxAttempts:3,timeoutMs:45000});
assert.deepEqual(a.routingTransport,p.routingTransport);assert.deepEqual(a.policy,DEMO_POLICY);assert.deepEqual(a.labels,tasks.EXPERIMENT_LABELS);
assert.deepEqual(a.toolContext,{mode:'with_prerequisites',dependencyVersion:1,dependencies:experiment.EXPERIMENT_TOOL_DEPENDENCIES});
assert.deepEqual(a.catalog,{ids:tasks.EXPERIMENT_CATALOG.map((t:any)=>t.id),tierAvailableIds:tasks.TIER_AVAILABLE_IDS});
assert.equal(a.untrustedDataNote,routing.ROUTING_UNTRUSTED_DATA_NOTE);assert.deepEqual(a.notes,experiment.LIVE_NOTES);
assert.deepEqual(a.summary,experiment.summarizeExperiment(a.trials,a.labels));
assert.equal(p.clean,true);assert.equal(p.sourceCommit,'9c5490be2a4777a10fb93a42a55bed078e3f4f52');assert.equal(c.sourceCommit,p.sourceCommit);
assert.equal(p.pairedCasesPlanned,57);assert.equal(p.repetitions,3);assert.equal(p.providerRequestCap,171);
assert.equal(p.requestedProposerModel,'gpt-6-sol');assert.equal(p.requestedReasoningEffort,'medium');assert.equal(p.jevModel,'jev-1.13.0');assert.equal(p.cliVersion,'codex-cli 0.156.1');
assert.equal(p.argv.length,11);assert.deepEqual(p.argv.slice(0,-1),['--source',p.sourceCommit,'--live','--model','gpt-6-sol','--runs','3','--with-prerequisites','--sum-recovery','--out']);assert(p.argv.at(-1).endsWith('.json'));
assert.equal(c.exitCode,0);assert.equal(c.artifactValid,true);assert.equal(c.artifactPresent,true);assert.equal(c.artifactSha256,sha(raw));
for(const flag of ['sourceUnchanged','runnerUnchanged','packageUnchanged'])assert.equal(c[flag],true);
for(const field of ['stoppedHttpStatus','wrapperFatal','interrupted'])assert.equal(c[field],null);assert.deepEqual(c.verificationErrors,[]);
const runnerPath='/tmp/jev-routing-recovery-package.mts',runnerSha=sha(read(runnerPath));
assert.equal(runnerSha,'a2b14dca517a4f6c9c8873ac60261b8d089a06ea33d552d505bc14f701de2356');assert.equal(p.runnerSha256,runnerSha);
assert.equal(git('rev-parse','HEAD'),p.sourceCommit);assert.equal(git('status','--porcelain'),'');
const scope=['src','examples/host','examples/routing','examples/arena','fixtures','scripts/arena-mcp.mjs','scripts/experiment-routing.ts','package.json','pnpm-lock.yaml'];
assert.deepEqual(p.files.map((f:any)=>f.path),git('ls-files',...scope).split('\n'));
for(const file of p.files){assert.equal(sha(read(file.path)),file.sha256);assert.equal(sha(execFileSync('git',['show',`${p.sourceCommit}:${file.path}`])),file.sha256);}
const reference='fda2774667872968e1ef48271faa040e435ffdfc';
const unchangedPaths=[...git('ls-files','src/routing').split('\n'),'src/contract/types.ts','examples/routing/experiment-tasks.ts','examples/routing/scenarios.ts','examples/host/codex.ts','examples/host/fixture-tools.mjs','examples/host/fixture-records.ts'];
for(const path of unchangedPaths)assert.equal(sha(read(path)),sha(execFileSync('git',['show',`${reference}:${path}`])));
const packageRoot='/tmp/jev-performance-2026-09-24/pinned-package',manifestPath='/tmp/jev-performance-2026-09-24/pinned-package-manifest.json',manifest=json(manifestPath);
assert.equal(sha(read(manifestPath)),p.packageManifestSha256);assert.deepEqual(p.packageFiles,manifest.files);assert.equal(manifest.version,'0.156.1');assert.equal(manifest.files.length,42);
const packagePaths=readdirSync(packageRoot,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>relative(packageRoot,resolve(e.parentPath,e.name))).sort();
assert.deepEqual(packagePaths,manifest.files.map((f:any)=>f.path).sort());
let packageBytes=0;for(const f of manifest.files){const bytes=read(resolve(packageRoot,f.path));assert.equal(sha(bytes),f.sha256);packageBytes+=bytes.length;}
assert.equal(p.cliSha256,'0196e89fe5a7598f816ee54232c3d7c26d75e502ab5cfe2c9240e81d90f7255a');assert.equal(sha(read(resolve(packageRoot,'bin/codex'))),p.cliSha256);
const countBy=(values:any[])=>values.reduce((m:any,v:any)=>(m[v]=(m[v]??0)+1,m),{});
const sum=(values:number[])=>values.reduce((n,v)=>n+v,0);
const metric=(values:(number|null)[])=>{const known=values.filter((v):v is number=>v!==null);return {units:values.length,known:known.length,unknown:values.length-known.length,reported:sum(known),total:known.length===values.length?sum(known):null};};
const usage=(attempts:any[])=>({attempts:attempts.length,requestBytes:sum(attempts.map(x=>x.requestBytes)),input:metric(attempts.map(x=>x.inputTokens)),output:metric(attempts.map(x=>x.outputTokens)),responseBytes:metric(attempts.map(x=>x.responseBytes)),latencyMs:metric(attempts.map(x=>x.latencyMs))});
const matches=(receipt:any,label:any)=>receipt.outcome===label.expectedOutcome&&(receipt.outcome!=='selected'||receipt.selectedIds.some((id:string)=>label.acceptableIds.includes(id)));
const trialRows:any[]=[],cases:any[]=[],allAttempts:any[]=[],firstAttempts:any[]=[],extraAttempts:any[]=[];
let physical=0,numericReplays=0,nullReplays=0,bundleReplays=0,position=0;
for(let run=1;run<=3;run++)for(const [taskIndex,task] of tasks.EXPERIMENT_TASKS.entries()){
 const arms=(run+taskIndex)%2===0?['all_tools','jev_top_k']:['jev_top_k','all_tools'];
 for(const [armIndex,arm] of arms.entries()){
  const t=a.trials[position++],available=tasks.TIER_AVAILABLE_IDS[task.size];
  assert.deepEqual([t.run,t.taskId,t.baseId,t.size,t.arm,t.order,t.catalogSize],[run,task.id,task.baseId,task.size,arm,armIndex+1,available.length]);
  const row:any={run,taskId:task.id,arm,order:t.order,outcome:t.outcome,exposedToolIds:t.exposedToolIds,proposerStatus:t.proposer?.status??null,proposerReported:t.proposer?.reported??null,traceTruncated:t.proposer?.traceTruncated??false,recordedToolCalls:t.proposer?.calledToolIds.length??0,toolCallStatuses:countBy((t.proposer?.toolCalls??[]).map((call:any)=>call.status)),proxies:t.proxies};
  trialRows.push(row);
  if(t.proposer){
   assert(Array.isArray(t.proposer.toolCalls));assert.equal(t.proposer.toolCalls.length,t.proposer.calledToolIds.length);
   for(const call of t.proposer.toolCalls){if(call.proposal)assert.equal(call.proposal.applied,false);if(call.testProposal)assert.equal(call.testProposal.applied,false);}
   const exposed=tasks.EXPERIMENT_CATALOG.filter((tool:any)=>t.exposedToolIds.includes(tool.id));
   const text=arenaPrompt({task:task.intent,files:task.files})+JSON.stringify(exposed.map(({id,description,inputSchema}:any)=>({name:id,description,inputSchema})));
   assert.equal(t.proxies.proposerInputTokens,Math.ceil(Buffer.byteLength(text)/4));
  }
  if(arm==='all_tools'){assert.equal(t.routing,null);assert(t.proposer);assert.deepEqual(t.exposedToolIds,available);continue;}
  const r=t.routing,l=r.attemptLedger;assert.equal(r.jevCalls,1);assert.equal(r.source,'jev');assert(l?.complete&&l.attempts.length>=1);assert.notEqual(l.stopReason,'cancelled');
  assert.equal(r.providerRequests,l.attempts.length);assert.equal(r.observedProviderRequests,l.attempts.length);
  const m=measurement.parseMeasurement(measurement.measureLedger(l,r.latencyMs),r.optionIds,r.evidence);
  assert.deepEqual(m.attemptLedger,l);assert.deepEqual({input:m.inputTokens,output:m.outputTokens},r.reported);
  const replayed:any[]=[];
  for(const [i,attempt] of l.attempts.entries()){
   assert.equal(attempt.index,i+1);if(i>0)assert.equal(l.attempts[i-1].status,'invalid_sum');
   const q=attempt.projection,numeric=attempt.status==='valid'||attempt.status==='invalid_sum';
   const evidence=numeric?{model:'jev-1.13.0',choice:q.choice,confidence:q.confidence,probabilities:q.probabilities}:null;
   const receipt=await routing.routeTools(tasks.EXPERIMENT_CATALOG,{intent:task.intent,availableIds:available},DEMO_POLICY,{source:'jev',review:async()=>evidence});
   assert.equal(receipt.execution.applied,false);assert.equal(receipt.request.questionSetVersion,5);assert.equal(receipt.request.model,'jev-1.13.0');assert.deepEqual(receipt.request.options.map((o:any)=>o.id),r.optionIds);
   const body=jevChoiceBody(receipt.request),d=c.dispatches[physical];assert(d);assert.equal(d.index,physical+1);assert.equal(d.requestSha256,sha(body));assert.equal(d.requestBytes,Buffer.byteLength(body));assert.equal(attempt.requestBytes,d.requestBytes);assert(d.httpStatus===null||(Number.isSafeInteger(d.httpStatus)&&d.httpStatus>=100&&d.httpStatus<=599));
   if(attempt.httpStatus===null&&d.httpStatus!==null)assert.equal(attempt.status,'timeout');else assert.equal(attempt.httpStatus,d.httpStatus);
   assert(![401,402,403,429].includes(d.httpStatus));
   assert.equal(t.proxies.jevRequestTokens,Math.ceil(Buffer.byteLength(body)/4));assert.equal(t.proxies.jevPhysicalRequestTokens,t.proxies.jevRequestTokens*l.attempts.length);
   if(numeric)numericReplays++;else nullReplays++;
   if(attempt.status==='valid'){assert.notEqual(receipt.evidence,null);assert.equal(i,l.attempts.length-1);}
   else {assert.equal(receipt.outcome,'unavailable');assert.equal(receipt.evidence,null);}
   if(attempt.status==='invalid_sum'){
    assert.deepEqual(Object.keys(q.probabilities).sort(),[...r.optionIds].sort());const mass=sum(r.optionIds.map((id:string)=>q.probabilities[id]));assert.equal(mass,attempt.diagnostic.probabilitySum);assert(Math.abs(mass-1)>1e-6);
   }
   replayed.push(receipt);allAttempts.push(attempt);(i===0?firstAttempts:extraAttempts).push(attempt);physical++;
  }
  const first=replayed[0],last=replayed.at(-1),label=tasks.EXPERIMENT_LABELS[task.baseId];
  assert.equal(last.outcome,r.outcome);assert.deepEqual(last.selectedIds,r.selectedIds);assert.deepEqual(last.evidence,r.evidence);assert.equal(last.reason,r.reason);
  const {context,...bundle}=routing.assembleToolBundle(last,experiment.EXPERIMENT_TOOL_DEPENDENCIES);assert.deepEqual({...bundle,cancelled:false},t.bundle);assert.deepEqual(context.state.loadedIds,t.exposedToolIds);assert.equal(bundle.status==='ready',t.proposer!==null);bundleReplays++;
  row.routingOutcome=r.outcome;row.physicalRequests=l.attempts.length;row.stopReason=l.stopReason;
  cases.push({run,taskId:task.id,baseId:task.baseId,size:task.size,firstOutcome:first.outcome,finalOutcome:last.outcome,firstSelectedIds:first.selectedIds,finalSelectedIds:last.selectedIds,firstExpected:matches(first,label),finalExpected:matches(last,label),stopReason:l.stopReason,returnedAttempt:l.returnedAttempt,attempts:l.attempts.length,requestBodySha256:c.dispatches[physical-l.attempts.length].requestSha256,usage:usage(l.attempts),attemptSummaries:l.attempts.map((attempt:any)=>({index:attempt.index,status:attempt.status,httpStatus:attempt.httpStatus,probabilitySum:attempt.diagnostic?.probabilitySum??null,inputTokens:attempt.inputTokens,outputTokens:attempt.outputTokens,responseBytes:attempt.responseBytes})),proposerStatus:t.proposer?.status??null});
 }
}
assert.equal(position,114);assert.equal(cases.length,57);assert.equal(physical,c.providerRequests);assert.equal(c.dispatches.length,physical);assert(physical<=171);
function aggregate(trials:any[]){
 const proposed=trials.filter(t=>t.proposer),routed=trials.filter(t=>t.routing),attempts=routed.flatMap(t=>t.routing.attemptLedger.attempts);
 return {trials:trials.length,legacyToolTraceCorrect:trials.filter(t=>experiment.scoreTrial(t,tasks.EXPERIMENT_LABELS[t.baseId]).correct===true).length,outcomes:countBy(trials.map(t=>t.outcome)),routingOutcomes:countBy(routed.map(t=>t.routing.outcome)),logicalJevCalls:sum(routed.map(t=>t.routing.jevCalls)),physicalJevRequests:attempts.length,proposerDispatches:proposed.length,proposerStatuses:countBy(proposed.map(t=>t.proposer.status)),absentProposers:trials.length-proposed.length,traceTruncated:proposed.filter(t=>t.proposer.traceTruncated).length,toolCallStatuses:countBy(proposed.flatMap(t=>t.proposer.toolCalls.map((call:any)=>call.status))),toolCallIds:countBy(proposed.flatMap(t=>t.proposer.calledToolIds)),proposerReported:{input:metric(proposed.map(t=>t.proposer.reported.input)),cachedInput:metric(proposed.map(t=>t.proposer.reported.cachedInput)),output:metric(proposed.map(t=>t.proposer.reported.output))},jevLogicalReported:{input:metric(routed.map(t=>t.routing.reported.input)),output:metric(routed.map(t=>t.routing.reported.output))},jevPhysicalReported:usage(attempts),combinedReported:{input:metric(trials.map(t=>experiment.reportedTotals(t).input)),output:metric(trials.map(t=>experiment.reportedTotals(t).output))},proxies:{logicalJev:sum(trials.map(t=>t.proxies.jevRequestTokens)),physicalJev:sum(trials.map(t=>t.proxies.jevPhysicalRequestTokens)),proposer:sum(trials.map(t=>t.proxies.proposerInputTokens)),total:sum(trials.map(t=>t.proxies.totalInputTokens))},localTimingMs:{routing:metric(routed.map(t=>t.routing.latencyMs)),proposer:metric(proposed.map(t=>t.proposer.durationMs))}};
}
const result={schemaVersion:1,kind:'host-recovery-full-independent-audit',status:'pass',auditedAt:new Date().toISOString(),sourceCommit:p.sourceCommit,inputs:[artifactPath,provenancePath,completionPath,runnerPath,manifestPath,fileURLToPath(import.meta.url)].map(path=>({path,sha256:sha(read(path))})),checks:{strictParseUnmodified:true,summaryRecomputedExactly:true,fixedPairs:57,rows:114,sourceFilesMatched:p.files.length,sourceManifestComplete:true,packageFilesMatched:manifest.files.length,packageBytes,runnerHashMatches:true,unchangedFromV5Paths:unchangedPaths,referenceSource:reference,independentRoutingAttemptReplays:physical,numericEvidenceReplays:numericReplays,hostNullEvidenceReplays:nullReplays,independentPrerequisiteReplays:bundleReplays,completeDispatchReconciliation:true,canonicalRequestBodiesAndIdenticalRecoveryChains:true,allRetainedProposalsUnapplied:true},protocol:{cliVersion:p.cliVersion,requestedProposerModel:p.requestedProposerModel,requestedReasoningEffort:p.requestedReasoningEffort,jevModel:p.jevModel,routingQuestionSetVersion:5,fixtureHostRevision:1,routingTransport:a.routingTransport,logicalJevCalls:57,physicalJevRequests:physical,extraJevRequests:physical-57,proposerDispatches:a.trials.filter((t:any)=>t.proposer).length,harnessProposerRetries:0},routing:{firstExpected:cases.filter(x=>x.firstExpected).length,finalExpected:cases.filter(x=>x.finalExpected).length,firstOutcomes:countBy(cases.map(x=>x.firstOutcome)),finalOutcomes:countBy(cases.map(x=>x.finalOutcome)),recoveredCases:cases.filter(x=>x.returnedAttempt>1).length,exhaustedCases:cases.filter(x=>x.stopReason==='exhausted').length,attemptStatuses:countBy(allAttempts.map(x=>x.status)),firstAttemptUsage:usage(firstAttempts),extraAttemptUsage:usage(extraAttempts),allAttemptUsage:usage(allAttempts)},byArm:Object.fromEntries(['all_tools','jev_top_k'].map(arm=>[arm,aggregate(a.trials.filter((t:any)=>t.arm===arm))])),byRun:[1,2,3].map(run=>({run,arms:Object.fromEntries(['all_tools','jev_top_k'].map(arm=>[arm,aggregate(a.trials.filter((t:any)=>t.arm===arm&&t.run===run))]))})),cases,trials:trialRows,limitations:['No delivered-output quality assessment; answer and proposal contents are not included in this audit.','Valid and sum-invalid numeric projections are replayed exactly; other failures replay the host null-evidence boundary because sanitized projections are not raw responses.','Reported subtotals retain known usage while unknown values remain explicit. Dispatches do not establish provider billing.','Requested CLI model and reasoning settings are not provider-attested identity. CLI-internal provider attempts are not retained.','No harness proposer retry loop exists in the frozen runner; per-trial identities and dispatch statuses are reconciled, but CLI internal retries cannot be audited.','Recorded proposal fields remain unapplied; evidence and metadata are not authorization or proof of external execution.','Byte/token proxies and local wall times do not establish cost or speed savings. Repeated development cases are not calibration.','Hashes establish byte identity, not authenticity.']};
writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({path:outputPath,sourceCommit:p.sourceCommit,rows:114,logicalJevCalls:57,physicalJevRequests:physical,firstExpected:result.routing.firstExpected,finalExpected:result.routing.finalExpected,proposerDispatches:result.protocol.proposerDispatches}));
