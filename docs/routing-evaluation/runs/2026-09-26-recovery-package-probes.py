"""No-network, no-Codex fault probes for the external full-comparison wrapper."""
import hashlib,json,os,pathlib,subprocess,sys,tempfile

WRAPPER=pathlib.Path('/tmp/jev-routing-recovery-package.mts')
ORIGINAL=WRAPPER.read_bytes()
NODE='/Users/buns/.nvm/versions/node/v24.18.1/bin/node'
TSX='/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs'
PIN='1'*40
ROOT=pathlib.Path(tempfile.mkdtemp(prefix='jev-recovery-package-probes-'))
PACKAGE='/tmp/jev-performance-2026-09-24/pinned-package'

PRELOAD=r'''
import fs from 'node:fs';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const originalExec=child.execFileSync,originalRead=fs.readFileSync;
child.execFileSync=function(file,args,options){
 if(file==='/tmp/jev-performance-2026-09-24/pinned-package/bin/codex'){
  if(JSON.stringify(args)!=='["--version"]')throw Error('Actual CLI execution forbidden by probe');
  fs.appendFileSync(process.env.PROBE_VERSION_LOG,'stub-version\n');
  return options?.encoding?'codex-cli 0.156.1\n':Buffer.from('codex-cli 0.156.1\n');
 }
 return originalExec.call(this,file,args,options);
};
fs.readFileSync=function(path,...rest){
 if(String(path).startsWith('/tmp/jev-performance-2026-09-24/pinned-package/')){
  if(process.env.PROBE_MODE==='bad_package')return Buffer.from('synthetic altered package');
  if(fs.existsSync('.package-fail'))throw Error('Synthetic package read failure');
 }
 return originalRead.call(this,path,...rest);
};
syncBuiltinESMExports();
globalThis.fetch=async(input,init)=>{
 fs.appendFileSync(process.env.PROBE_FORWARDED,JSON.stringify({bodyHashOnly:true})+'\n');
 return new Response('synthetic-sensitive-provider-error',{status:Number(process.env.PROBE_HTTP_STATUS||200)});
};
'''
MAIN=r'''
import {writeFileSync,unlinkSync} from 'node:fs';
export async function main(args,io){
 const mode=process.env.PROBE_MODE,out=args.at(-1),trials=[];
 if(mode==='no_artifact_success')return 0;
 if(mode==='cancel_before_dispatch')process.emit('SIGINT');
 const count=mode==='cap_violation'?172:57;
 for(let i=0;i<count;i++){
  if(io.signal.aborted&&!['cap_violation','terminal_http_retry','dispatch_after_cancel'].includes(mode))break;
  if(mode==='dispatch_after_cancel'&&i===0)process.emit('SIGINT');
  const attempts=[],physical=mode==='recovered'||mode==='changed_recovery_body'?3:mode==='hidden_attempt'?2:1;
  for(let j=0;j<physical;j++){
   let response=null;
   const body=JSON.stringify({synthetic:true,index:i,...(mode==='changed_recovery_body'?{attempt:j}:{})});
   try{response=await io.fetch(mode==='invalid_endpoint'?'https://synthetic.invalid/blocked':'https://api.typesafe.ai/v1/systemone',{method:'POST',body:mode==='bad_body'?undefined:body,signal:io.signal});}catch{}
   if(response)attempts.push({index:j+1,httpStatus:mode==='status_mismatch'?201:response.status,requestBytes:Buffer.byteLength(body)+(mode==='bad_request_bytes'?1:0),status:response.status===200?'valid':'http_error'});
   if(mode==='cancel_after_http'){attempts.at(-1).httpStatus=null;attempts.at(-1).status='cancelled';}
  }
  if(mode==='hidden_attempt')attempts.pop();
  trials.push({index:i,arm:'all_tools',routing:null});
  trials.push({index:i,arm:'jev_top_k',routing:{providerRequests:attempts.length,...(mode==='missing_ledger'?{}:{attemptLedger:{attempts}})}});
  if(mode==='throw_after_dispatch')throw Error('synthetic-sensitive-provider-error');
  if(mode==='sigint'&&i===0)process.emit('SIGINT');
  if(mode==='sigterm'&&i===0)process.emit('SIGTERM');
  if(mode==='terminal_http_retry'&&i===1)break;
  if(mode==='dispatch_after_cancel')break;
 }
 if(mode==='runner_read_failure')unlinkSync(process.env.PROBE_RUNNER);
 if(mode==='source_read_failure')unlinkSync('sentinel.txt');
 if(mode==='git_failure')writeFileSync('.git-fail','synthetic marker');
 if(mode==='package_read_failure')writeFileSync('.package-fail','synthetic marker');
 if(mode==='missing_row')trials.pop();
 writeFileSync(out,JSON.stringify({schemaVersion:1,source:'scripted-probe',routingQuestionSetVersion:mode==='wrong_version'?4:5,fixtureHostRevision:mode==='wrong_host_revision'?2:1,routingTransport:{version:1,recovery:mode==='wrong_config'?'off':'probability_sum_only_v1',maxAttempts:3,timeoutMs:45000},status:io.signal.aborted?'cancelled':'complete',trials})+'\n');
 return io.signal.aborted?130:0;
}
'''

GUARD_MODES={'bad_pin','wrong_pin','missing_recovery','extra_arg','wrong_model','wrong_runs','reordered_args','ci','existing_output','dirty_source','bad_package'}

def probe(mode,http=None):
 folder=ROOT/mode;folder.mkdir();runner=folder/'wrapper.mts';runner.write_bytes(ORIGINAL)
 modules={'examples/routing/experiment-cli.ts':MAIN,'examples/routing/experiment.ts':'export async function parseExperimentArtifact(value){if(process.env.PROBE_MODE==="parser_reject")throw Error("Synthetic parser rejection");return value;}\n','package.json':'{"type":"module"}\n','sentinel.txt':'synthetic frozen source\n'}
 for name,content in modules.items():
  p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
 git=folder/'bin/git';git.parent.mkdir();git.write_text('#!'+sys.executable+'\nimport pathlib,os,sys\nargs=sys.argv[1:]\nif pathlib.Path(".git-fail").exists():sys.exit(3)\nif args[0]=="rev-parse":print('+repr(PIN)+')\nelif args[0]=="ls-files":print('+repr('\n'.join(modules))+')\nelif args[0]=="status":\n if os.environ.get("PROBE_MODE")=="dirty_source":print(" M synthetic-source")\nelse:sys.exit(2)\n');git.chmod(0o755)
 preload=folder/'preload.mjs';preload.write_text(PRELOAD);out=folder/'result.json';completion=folder/'result-completion.json';provenance=folder/'result-provenance.json';forwarded=folder/'forwarded.log';versionlog=folder/'version.log'
 env={'PATH':str(git.parent)+os.pathsep+os.environ['PATH'],'LANG':'C.UTF-8','PROBE_MODE':mode,'PROBE_RUNNER':str(runner),'PROBE_FORWARDED':str(forwarded),'PROBE_VERSION_LOG':str(versionlog),'TYPESAFE_API_KEY':'synthetic-probe-credential'}
 if http:env['PROBE_HTTP_STATUS']=str(http)
 args=['--source',PIN,'--live','--model','gpt-6-sol','--runs','3','--with-prerequisites','--sum-recovery','--out',str(out)]
 if mode=='bad_pin':args[1]='not-a-sha'
 if mode=='wrong_pin':args[1]='2'*40
 if mode=='missing_recovery':args.remove('--sum-recovery')
 if mode=='extra_arg':args.append('--extra')
 if mode=='wrong_model':args[4]='different-model'
 if mode=='wrong_runs':args[6]='4'
 if mode=='reordered_args':args[7],args[8]=args[8],args[7]
 if mode=='ci':env['CI']='true'
 if mode=='existing_output':out.write_text('preserve this pre-existing output')
 result=subprocess.run([NODE,'--import',TSX,'--import',str(preload),str(runner),*args],cwd=folder,env=env,capture_output=True,text=True,timeout=40)
 sent=forwarded.read_text().count('\n') if forwarded.exists() else 0;versions=versionlog.read_text().count('\n') if versionlog.exists() else 0
 findings=[]
 if mode in GUARD_MODES:
  assert result.returncode!=0 and sent==0 and not completion.exists() and not provenance.exists(),(mode,result.returncode,result.stderr)
  assert versions==0
  if mode=='existing_output':assert out.read_text()=='preserve this pre-existing output'
  data={}
 else:
  assert completion.exists(),(mode,result.returncode,result.stderr)
  data=json.loads(completion.read_text());assert data['providerRequests']==len(data['dispatches'])==sent
  assert versions==1
  assert 'synthetic-sensitive-provider-error' not in completion.read_text()+provenance.read_text()+result.stderr
  assert 'synthetic-probe-credential' not in completion.read_text()+provenance.read_text()+result.stderr
  assert data['exitCode']==result.returncode,(mode,'completion exit mismatch')
  if mode in ['normal','recovered']:assert result.returncode==0 and sent==(171 if mode=='recovered' else 57) and data['artifactPresent'] and data['artifactValid'] and data['exitCode']==0
  elif mode=='cap_violation':assert result.returncode==1 and sent==171 and data['wrapperFatal']=='unexpected_or_excess_dispatch'
  elif mode in ['invalid_endpoint','bad_body','dispatch_after_cancel']:assert result.returncode==1 and sent==0 and data['wrapperFatal']=='unexpected_or_excess_dispatch'
  elif mode.startswith('terminal_http_') or mode=='cancel_after_http':
   assert result.returncode==1 and sent==1 and data['stoppedHttpStatus']==http and data['exitCode']==1
   if mode=='terminal_http_retry':assert data['wrapperFatal']=='unexpected_or_excess_dispatch'
   else:assert data['wrapperFatal'] is None
  elif mode in ['sigint','sigterm','cancel_before_dispatch']:
   expected=143 if mode=='sigterm' else 130
   assert result.returncode==expected and data['interrupted']==expected and data['exitCode']==expected
   assert sent==(0 if mode=='cancel_before_dispatch' else 1)
  elif mode=='throw_after_dispatch':assert result.returncode==1 and sent==1 and data['artifactPresent'] is False
  elif mode in ['runner_read_failure','source_read_failure','git_failure','package_read_failure']:
   assert result.returncode==1 and data['artifactPresent'] and sent==57
   expected='runner_verification_failed' if mode=='runner_read_failure' else 'package_verification_failed' if mode=='package_read_failure' else 'source_verification_failed'
   assert expected in data['verificationErrors']
  elif mode=='no_artifact_success':
   assert sent==0 and data['artifactPresent'] is False and result.returncode==1 and data['artifactValid'] is False
  elif mode in ['missing_ledger','hidden_attempt','bad_request_bytes','status_mismatch','changed_recovery_body','missing_row','wrong_version','wrong_host_revision','wrong_config','parser_reject']:
   assert result.returncode==1 and data['artifactPresent'] and data['artifactValid'] is False
  else:raise AssertionError(mode)
 return {'mode':mode,'probeCompleted':True,'exitCode':result.returncode,'forwardedToFakeFetch':sent,'stubbedCliVersionCalls':versions,'completion':str(completion) if completion.exists() else None,'completionExitCode':data.get('exitCode'),'wrapperFatal':data.get('wrapperFatal'),'verificationErrors':data.get('verificationErrors'),'findings':findings}

rows=[]
for mode in ['normal','recovered','cap_violation','invalid_endpoint','bad_body','dispatch_after_cancel','sigint','sigterm','cancel_before_dispatch','throw_after_dispatch','runner_read_failure','source_read_failure','git_failure','package_read_failure','no_artifact_success','missing_ledger','hidden_attempt','bad_request_bytes','status_mismatch','changed_recovery_body','missing_row','wrong_version','wrong_host_revision','wrong_config','parser_reject']:
 rows.append(probe(mode))
for status in [401,402,403,429]:rows.append(probe('terminal_http_'+str(status),status))
rows.append(probe('terminal_http_retry',402))
rows.append(probe('cancel_after_http',402))
for mode in sorted(GUARD_MODES):rows.append(probe(mode))
assert WRAPPER.read_bytes()==ORIGINAL
summary={'schemaVersion':1,'kind':'recovery-full-wrapper-offline-probes','wrapperSha256':hashlib.sha256(ORIGINAL).hexdigest(),'completedProbes':len(rows),'probes':rows,'findings':sorted({f for r in rows for f in r['findings']}),'limitations':['External wrapper lifecycle only; experiment main and fetch are local stubs. Actual adapter/consumer telemetry requires frozen-source tests.','Pinned package files are read and hashed, never modified. CLI --version is intercepted before any executable invocation.','Synthetic Git shim creates no commits. No CLI or provider calls occur.']}
out=pathlib.Path('/tmp/jev-recovery-package-probe-results.json');out.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'completedProbes':len(rows),'findings':summary['findings'],'results':str(out),'fixtureRoot':str(ROOT),'wrapperSha256':summary['wrapperSha256']},indent=2))
