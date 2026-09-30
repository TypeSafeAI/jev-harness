"""Focused external-wrapper cancellation checks using the actual host schema; no providers or CLI."""
import ast,hashlib,json,os,pathlib,subprocess,sys,tempfile
ROOT=pathlib.Path(tempfile.mkdtemp(prefix='jev-recovery-cancellation-probes-'))
SOURCE=pathlib.Path('/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness-wt/routing-host-recovery')
NODE='/Users/buns/.nvm/versions/node/v24.18.1/bin/node'
TSX='/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx/dist/loader.mjs'
PIN='1'*40
PHASE=sys.argv[1] if len(sys.argv)>1 else 'green'
def literal(path,name):
 tree=ast.parse(pathlib.Path(path).read_text())
 return next(ast.literal_eval(s.value) for s in tree.body if isinstance(s,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in s.targets))
PRELOAD=literal('/tmp/jev-recovery-package-probes.py','PRELOAD')
def module(path):return (SOURCE/path).as_uri()

def run(kind,mode):
 folder=ROOT/(kind+'-'+mode);folder.mkdir();original=pathlib.Path('/tmp/jev-routing-recovery-'+('diagnostic' if kind=='diagnostic' else 'package')+'.mts');runner=folder/'wrapper.mts';runner.write_bytes(original.read_bytes())
 if kind=='diagnostic':
  modules={
   'src/routing/index.ts':f'''import {{routeTools as actual}} from {json.dumps(module('src/routing/index.ts'))};
export async function routeTools(...args){{const r=await actual(...args);if(process.env.PROBE_MODE==='missing_evidence_no_cancel')return {{...r,evidence:null,outcome:'unavailable'}};if(process.env.PROBE_MODE==='cancel_mismatched_evidence')return {{...r,evidence:{{model:'jev-1.13.0',choice:'needs_clarification',confidence:0.1,probabilities:{{needs_clarification:1}}}}}};return r;}}
''',
   'examples/host/jev-choice.ts':f'''import {{createJevChoiceRouter as actual,jevChoiceBody}} from {json.dumps(module('examples/host/jev-choice.ts'))};export {{jevChoiceBody}};
export function createJevChoiceRouter(options){{return actual({{...options,onMeasurement:m=>{{if(process.env.PROBE_MODE!=='missing_evidence_no_cancel'&&m.attemptLedger?.stopReason==='valid')process.emit('SIGTERM');}}}});}}
''',
   'examples/routing/scenarios.ts':f'export {{DEMO_POLICY}} from {json.dumps(module("examples/routing/scenarios.ts"))};',
   'examples/routing/experiment-tasks.ts':f'export * from {json.dumps(module("examples/routing/experiment-tasks.ts"))};',
   'examples/routing/experiment.ts':f'export {{fakeRouterFor}} from {json.dumps(module("examples/routing/experiment.ts"))};',
   'examples/routing/measurement.ts':f'export {{parseMeasurement}} from {json.dumps(module("examples/routing/measurement.ts"))};',
  }
 else:
  modules={
   'examples/routing/experiment-cli.ts':f'''
import {{writeFileSync}} from 'node:fs';
import {{runTrial,buildArtifact,EXPERIMENT_TOOL_DEPENDENCIES}} from {json.dumps(module('examples/routing/experiment.ts'))};
import {{EXPERIMENT_TASKS,EXPERIMENT_LABELS}} from {json.dumps(module('examples/routing/experiment-tasks.ts'))};
import {{DEMO_POLICY}} from {json.dumps(module('examples/routing/scenarios.ts'))};
const transport={{version:1,recovery:'probability_sum_only_v1',maxAttempts:3,timeoutMs:45000}};
export async function main(args,io){{
 process.emit('SIGINT');
 const deps={{source:'live',signal:io.signal,routingTransport:transport,routerFor:()=>({{router:{{source:'jev',review:async()=>{{throw Error('No dispatch allowed');}}}},measurement:()=>null}}),proposer:{{source:'codex',propose:async()=>{{throw Error('No proposer allowed');}}}}}};
 const trial=await runTrial(EXPERIMENT_TASKS[0],'jev_top_k',1,1,DEMO_POLICY,deps,true);
 if(process.env.PROBE_MODE==='missing_after_logical_call')trial.routing.jevCalls=1;
 if(process.env.PROBE_MODE==='nonzero_physical_count')trial.routing.providerRequests=1;
 if(process.env.PROBE_MODE==='nonzero_observed_count')trial.routing.observedProviderRequests=1;
 const artifact=buildArtifact([trial],{{source:'live',status:'cancelled',command:'synthetic cancellation probe',generatedAt:new Date().toISOString(),policy:DEMO_POLICY,runs:3,sizes:['small','medium','large'],proposer:'synthetic no-proposer fixture',labels:EXPERIMENT_LABELS,withPrerequisites:true,routingTransport:transport}});
 writeFileSync(args.at(-1),JSON.stringify(artifact)+String.fromCharCode(10));return 130;
}}
''',
   'examples/routing/experiment.ts':f'export {{parseExperimentArtifact}} from {json.dumps(module("examples/routing/experiment.ts"))};',
  }
 modules['package.json']='{"type":"module"}'
 for name,text in modules.items():
  p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 git=folder/'bin/git';git.parent.mkdir();git.write_text('#!'+sys.executable+'\nimport sys\na=sys.argv[1:]\nif a[0]=="rev-parse":print('+repr(PIN)+')\nelif a[0]=="ls-files":print('+repr('\n'.join(modules))+')\nelif a[0]!="status":sys.exit(2)\n');git.chmod(0o755)
 preload=folder/'preload.mjs';preload.write_text(PRELOAD);out=folder/'result.json';completion=folder/'result-completion.json'
 env={'PATH':str(git.parent)+os.pathsep+os.environ['PATH'],'LANG':'C.UTF-8','PROBE_MODE':mode,'PROBE_RUNNER':str(runner),'PROBE_FORWARDED':str(folder/'forwarded.log'),'PROBE_VERSION_LOG':str(folder/'version.log'),'TYPESAFE_API_KEY':'synthetic-probe-credential'}
 args=['--offline','--source',PIN,'--out',str(out)] if kind=='diagnostic' else ['--source',PIN,'--live','--model','gpt-6-sol','--runs','3','--with-prerequisites','--sum-recovery','--out',str(out)]
 result=subprocess.run([NODE,'--import',TSX,'--import',str(preload),str(runner),*args],cwd=folder,env=env,capture_output=True,text=True,timeout=40)
 data=json.loads((out if kind=='diagnostic' else completion).read_text())
 if (folder/'forwarded.log').exists():assert (folder/'forwarded.log').read_text()=='','Unexpected provider dispatch'
 positive=mode in ['cancel_valid_response','cancelled_zero_route']
 expected=130 if positive and PHASE=='green' else 1
 assert result.returncode==expected,(kind,mode,expected,result.returncode,result.stderr,data)
 if kind=='diagnostic':
  assert data['casesRecorded']==1 and data['requests']==3
  assert data['trials'][0]['measurement']['attemptLedger']['stopReason']=='valid'
  assert data['status']==('cancelled' if positive and PHASE=='green' else 'failed')
 else:
  assert data['providerRequests']==0 and data['artifactPresent']
  assert data['artifactValid']==(positive and PHASE=='green')
 return {'kind':kind,'mode':mode,'phase':PHASE,'wrapperSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'exitCode':result.returncode,'passed':True,'record':str(out if kind=='diagnostic' else completion)}

rows=[run('diagnostic',m) for m in ['cancel_valid_response','missing_evidence_no_cancel','cancel_mismatched_evidence']]
rows += [run('package',m) for m in ['cancelled_zero_route','missing_after_logical_call','nonzero_physical_count','nonzero_observed_count']]
out=pathlib.Path('/tmp/jev-recovery-cancellation-probe-'+PHASE+'.json');out.write_text(json.dumps({'schemaVersion':1,'phase':PHASE,'passed':len(rows),'sourceSchema':str(SOURCE),'probes':rows,'limits':['Actual parser, router, and fixture modules are imported read-only. No proposer or provider is invoked.','Source-clean verification is exercised with a synthetic Git shim; no commits are created.']},indent=2)+'\n');print(json.dumps({'phase':PHASE,'passed':len(rows),'results':str(out),'fixtureRoot':str(ROOT)},indent=2))
