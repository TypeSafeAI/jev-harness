"""Offline fault probes for the external recovery wrapper; no repository mutation or network."""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile

WRAPPER = pathlib.Path('/tmp/jev-routing-recovery-diagnostic.mts')
NODE = '/Users/buns/.nvm/versions/node/v24.18.1/bin/node'
TSX = '/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs'
PIN = '1' * 40
ROOT = pathlib.Path(tempfile.mkdtemp(prefix='jev-recovery-wrapper-probes-'))
ORIGINAL = WRAPPER.read_bytes()

ROUTE = r'''
export async function routeTools(catalog,input,policy,router,signal){
 const request={model:'jev-1.13.0',questionSetVersion:5,intent:input.intent,options:[{id:'read_file',description:'synthetic read'},{id:'needs_clarification',description:'synthetic clarification'}]};
 if(process.env.PROBE_MODE==='cancel_before_query'){process.emit('SIGTERM');return {request,evidence:null,outcome:'unavailable'};}
 let evidence=null;
 try{evidence=await router.review(request,signal);}catch{}
 const valid=evidence && evidence.model===request.model && Math.abs(Object.values(evidence.probabilities).reduce((a,b)=>a+b,0)-1)<=1e-6;
 const outcome=!valid?'unavailable':evidence.confidence<0.7?'needs_clarification':'selected';
 return {schemaVersion:1,request,policy,evidence:valid?evidence:null,outcome,selectedIds:outcome==='selected'?['read_file']:[],execution:{applied:false}};
}
'''
HOST = r'''
import {unlinkSync,writeFileSync} from 'node:fs';
const size=s=>Buffer.byteLength(s);
export const jevChoiceBody=query=>JSON.stringify({model:query.model,task:query.intent,options:query.options});
export function createJevChoiceRouter(options){
 const state={measurement:null,error:null};
 const router={source:'jev',async review(query,outerSignal){
  const mode=process.env.PROBE_MODE,body=jevChoiceBody(query),signal=AbortSignal.any([options.signal,outerSignal]);
  const attempts=[];
  function finish(stopReason){
   const metric=k=>attempts.some(a=>a[k]===null)?null:attempts.reduce((s,a)=>s+a[k],0);
   state.measurement={requestBytes:attempts.reduce((s,a)=>s+a.requestBytes,0),responseBytes:metric('responseBytes'),inputTokens:metric('inputTokens'),outputTokens:metric('outputTokens'),latencyMs:0,
    attemptLedger:{complete:true,recovery:options.recovery,maxAttempts:3,timeoutMs:45000,attempts,stopReason}};
   if(mode==='missing_ledger')delete state.measurement.attemptLedger;
   if(mode==='bad_ledger_count')state.measurement.attemptLedger.attempts=attempts.slice(1);
   if(mode==='bad_totals')state.measurement.inputTokens+=1;
  }
  for(let i=1;i<=3;i++){
   const attempt={index:i,requestBytes:size(body),httpStatus:null,status:'pending',inputTokens:null,outputTokens:null,responseBytes:null,latencyMs:0};
   attempts.push(attempt);
   let response;
   try{
    response=await options.fetch('https://synthetic.invalid/no-network',{body:mode==='changed_body'&&i===2?body+' ':body,signal:mode==='changed_signal'&&i===2?AbortSignal.any([options.signal,outerSignal]):signal});
   }catch{attempt.status='transport_error';finish('failure');throw Error('Synthetic transport failure');}
   if(mode==='cancel_after_http'){
    process.emit('SIGTERM');attempt.status='cancelled';finish('cancelled');return null;
   }
   attempt.httpStatus=response.status;
   if(!response.ok){attempt.status='http_error';finish('failure');state.error='Synthetic HTTP failure';if(mode==='terminal_http_retry'&&i===1)continue;throw Error('Synthetic HTTP failure');}
   const text=await response.text(),raw=JSON.parse(text),answer=raw.answers.tool;
   attempt.responseBytes=size(text);attempt.inputTokens=raw.usage.input_tokens;attempt.outputTokens=raw.usage.output_tokens;
   const invalidModel=raw.model!==query.model,invalidSum=Math.abs(Object.values(answer.probabilities).reduce((a,b)=>a+b,0)-1)>1e-6;
   attempt.status=invalidModel?'invalid_other':invalidSum?'invalid_sum':'valid';
   if(invalidModel){finish('failure');return null;}
   if(invalidSum){if(i<3&&mode!=='ignored_recovery')continue;finish('exhausted');return null;}
   finish('valid');
   if(mode==='runner_read_failure'&&!globalThis.probeMutated){globalThis.probeMutated=true;unlinkSync(process.env.PROBE_RUNNER);}
   if(mode==='source_read_failure'&&!globalThis.probeMutated){globalThis.probeMutated=true;unlinkSync('sentinel.txt');}
   if(mode==='git_failure'&&!globalThis.probeMutated){globalThis.probeMutated=true;writeFileSync('.git-fail','synthetic failure');}
   return {model:raw.model,choice:answer.choice,confidence:answer.confidence,probabilities:answer.probabilities};
  }
 }};
 return {state,router};
}
'''
TASKS = "export const EXPERIMENT_CATALOG=[{id:'read_file'}];export const TIER_AVAILABLE_IDS={small:['read_file']};export const EXPERIMENT_TASKS=Array.from({length:19},(_,i)=>({id:'task-'+i,baseId:'task-'+i,size:'small',intent:'Synthetic task '+i}));export const EXPERIMENT_LABELS={synthetic:true};\n"
FAKE = "export const fakeRouterFor=()=>({router:{review:async(query)=>({model:query.model,choice:'read_file',confidence:1,probabilities:{read_file:1,needs_clarification:0}})}});\n"
PRELOAD = r'''
import {appendFileSync} from 'node:fs';
globalThis.fetch=async(_input,_init)=>{
 appendFileSync(process.env.PROBE_FORWARDED,'forwarded\n');
 return new Response('synthetic-sensitive-provider-error',{status:Number(process.env.PROBE_HTTP_STATUS||402)});
};
// Any accidental network access through node:http/node:https is forbidden by this fixture.
'''

def probe(mode, live=False, http_status=None):
 folder=ROOT/mode;folder.mkdir();runner=folder/'wrapper.mts';runner.write_bytes(ORIGINAL)
 modules={'src/routing/index.ts':ROUTE,'examples/host/jev-choice.ts':HOST,'examples/routing/scenarios.ts':'export const DEMO_POLICY={confidenceFloor:0.7};\n','examples/routing/experiment-tasks.ts':TASKS,'examples/routing/experiment.ts':FAKE,'examples/routing/measurement.ts':'export function parseMeasurement(value){if(!value)throw Error("Synthetic missing measurement");return value;}\n','package.json':'{"type":"module"}\n','sentinel.txt':'synthetic unchanged source\n'}
 for name,content in modules.items():
  path=folder/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
 git=folder/'bin/git';git.parent.mkdir();git.write_text('#!'+sys.executable+'\nimport pathlib,sys\nargs=sys.argv[1:]\nif pathlib.Path(".git-fail").exists():sys.exit(3)\nif args[0]=="rev-parse":print('+repr(PIN)+')\nelif args[0]=="ls-files":print('+repr('\n'.join(modules))+')\nelif args[0]!="status":sys.exit(2)\n');git.chmod(0o755)
 preload=folder/'preload.mjs';preload.write_text(PRELOAD);out=folder/'result.json';forwarded=folder/'forwarded.log'
 env={'PATH':str(git.parent)+os.pathsep+os.environ['PATH'],'LANG':'C.UTF-8','PROBE_MODE':mode,'PROBE_RUNNER':str(runner),'PROBE_FORWARDED':str(forwarded),'TYPESAFE_API_KEY':'synthetic-probe-credential'}
 if http_status:env['PROBE_HTTP_STATUS']=str(http_status)
 cmd=[NODE,'--import',TSX,'--import',str(preload),str(runner),'--live' if live else '--offline','--source',PIN,'--out',str(out)]
 result=subprocess.run(cmd,cwd=folder,env=env,capture_output=True,text=True,timeout=30)
 assert out.exists(),(mode,result.returncode,result.stderr)
 data=json.loads(out.read_text());sent=forwarded.read_text().count('\n') if forwarded.exists() else 0
 assert data['requests']==sum(len(t['dispatches']) for t in data['trials']),(mode,'unretained dispatches')
 assert 'synthetic-sensitive-provider-error' not in out.read_text()
 assert 'synthetic-probe-credential' not in out.read_text()
 if mode=='normal':assert result.returncode==0 and data['status']=='complete' and data['casesRecorded']==57 and data['requests']==87
 elif mode in ['changed_body','changed_signal']:
  assert result.returncode==1 and data['status']=='failed' and data['casesRecorded']==1 and data['requests']==1
  assert data['fatalReason']==('unexpected_request_body' if mode=='changed_body' else 'changed_deadline_signal')
 elif mode in ['missing_ledger','bad_ledger_count','bad_totals']:
  assert result.returncode==1 and data['status']=='failed' and data['casesRecorded']==1 and data['requests']==3
 elif mode=='ignored_recovery':assert result.returncode==1 and data['status']=='failed' and data['casesRecorded']==1 and data['requests']==1
 elif mode in ['runner_read_failure','source_read_failure','git_failure']:
  assert result.returncode==1 and data['status']=='failed' and data['casesRecorded']==57 and data['requests']==87
  expected='runner_verification_failed' if mode=='runner_read_failure' else 'source_verification_failed';assert expected in data['verificationErrors']
 elif mode.startswith('terminal_http_') and mode!='terminal_http_retry':
  assert result.returncode==1 and data['status']=='provider_unavailable' and data['casesRecorded']==1 and data['requests']==sent==1 and data['stoppedHttpStatus']==http_status
 elif mode=='terminal_http_retry':
  assert result.returncode==1 and data['status']=='failed' and data['casesRecorded']==1 and data['requests']==sent==1 and data['fatalReason']=='dispatch_after_stop'
 elif mode=='cancel_before_query':assert result.returncode==130 and data['status']=='cancelled' and data['casesRecorded']==1 and data['requests']==0
 elif mode=='cancel_after_http':assert result.returncode==130 and data['status']=='cancelled' and data['casesRecorded']==1 and data['requests']==sent==1 and data['stoppedHttpStatus']==402
 else:raise AssertionError(mode)
 return {'mode':mode,'passed':True,'exitCode':result.returncode,'status':data['status'],'casesRecorded':data['casesRecorded'],'requests':data['requests'],'forwardedToFakeFetch':sent,'fatalReason':data['fatalReason'],'verificationErrors':data['verificationErrors'],'artifact':str(out)}

rows=[]
for mode in ['normal','changed_body','changed_signal','missing_ledger','bad_ledger_count','bad_totals','ignored_recovery','runner_read_failure','source_read_failure','git_failure','cancel_before_query']:
 rows.append(probe(mode))
for status in [401,402,403,429]:rows.append(probe('terminal_http_'+str(status),True,status))
rows.append(probe('terminal_http_retry',True,402));rows.append(probe('cancel_after_http',True,402))
assert WRAPPER.read_bytes()==ORIGINAL
summary={'schemaVersion':1,'kind':'recovery-wrapper-offline-fault-probes','wrapperSha256':hashlib.sha256(ORIGINAL).hexdigest(),'passed':len(rows),'probes':rows,'limitations':['Only external wrapper behavior is exercised. Stub adapter/measurement parser do not validate the real implementation.','Synthetic Git shim establishes fixture metadata without making commits.','--live branches use a preloaded local fetch stub; no provider or CLI is called.']}
out=pathlib.Path('/tmp/jev-recovery-wrapper-probe-results.json');out.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'status':'PASS','probes':len(rows),'results':str(out),'fixtureRoot':str(ROOT),'wrapperSha256':summary['wrapperSha256']},indent=2))
