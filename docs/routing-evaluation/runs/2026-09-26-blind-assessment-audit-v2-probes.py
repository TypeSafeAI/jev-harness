"""Reference-integrity probes only; all content is synthetic and no assessment is changed."""
import importlib.util,json,pathlib,tempfile,hashlib,copy
P=pathlib.Path
HELPER=P('/tmp/jev-audit-blind-assessments-v2.py')
spec=importlib.util.spec_from_file_location('audit_v2',HELPER);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ROOT=P(tempfile.mkdtemp(prefix='jev-blind-audit-v2-probes-'))
value={'output':{'answer':'synthetic answer','toolCalls':[{'proposal':{'patch':'first exact patch'}},{'proposal':{'patch':'second exact patch'},'testProposal':{'content':'second exact test'}}]}}
results=[]
paths={
 'output.answer':['synthetic answer'],
 'output.toolCalls.0.proposal.patch':['first exact patch'],
 'output.toolCalls.1.proposal.patch':['second exact patch'],
 'output.toolCalls[1].proposal.patch':['second exact patch'],
 'output.toolCalls[1].testProposal.content':['second exact test'],
 'output.toolCalls.proposal.patch':['first exact patch','second exact patch'],
 'output.toolCalls.testProposal.content':['second exact test'],
 'output.toolCalls.2.proposal.patch':[],
 'output.toolCalls[2].proposal.patch':[],
 'output.toolCalls.1.proposal.missing':[],
 'output.missing':[],
}
for path,expected in paths.items():
 assert m.select(value,m.parse_path(path))==expected,path
 results.append({'case':'select '+path,'passed':True})
for path in ['', '.output', 'output.', 'output..answer','output.toolCalls.-1.proposal.patch','output.toolCalls.+1.proposal.patch','output.toolCalls.01.proposal.patch','output.toolCalls[-1].proposal.patch','output.toolCalls[01].proposal.patch','output.toolCalls[1.0].proposal.patch','output.toolCalls[1]proposal.patch','output.toolCalls[]','output.toolCalls[1][x]']:
 try:m.parse_path(path)
 except AssertionError:pass
 else:raise AssertionError(('Malformed path accepted',path))
 results.append({'case':'reject '+path,'passed':True})
for mode,field,evidence,accept in [('dot','output.toolCalls.1.proposal.patch','second exact patch',True),('bracket','output.toolCalls[1].proposal.patch','second exact patch',True),('wildcard','output.toolCalls.proposal.patch','second exact patch',True),('wrong_index_excerpt','output.toolCalls.0.proposal.patch','second exact patch',False),('wrong_excerpt','output.toolCalls.1.proposal.patch','not present',False),('out_of_range','output.toolCalls.2.proposal.patch','second exact patch',False),('invalid_index','output.toolCalls.-1.proposal.patch','second exact patch',False)]:
 prefix=ROOT/mode;blind=P(str(prefix)+'.jsonl');ann=P(str(prefix)+'-assessments.json');out=ROOT/(mode+'-fresh-audit.json')
 rows=[dict(copy.deepcopy(value),caseId=f'case-{i}') for i in range(114)]
 blind.write_text(''.join(json.dumps(row)+'\n' for row in rows))
 cases=[{'caseId':r['caseId'],'contentQuality':'meets','evidenceField':field,'evidence':evidence,'grounding':'synthetic','delivery':'synthetic','constraintViolation':False,'reason':'synthetic fixture'} for r in rows]
 ann.write_text(json.dumps({'inputSha256':m.digest(blind),'rubricSha256':m.RUBRIC_SHA256,'cases':cases}))
 before=(m.digest(blind),m.digest(ann))
 try:m.audit(prefix,out)
 except AssertionError:assert not accept,mode
 else:assert accept,mode
 assert out.exists()==accept and before==(m.digest(blind),m.digest(ann))
 if accept:
  preserved=m.digest(out)
  try:m.audit(prefix,out)
  except FileExistsError:pass
  else:raise AssertionError('Existing audit was overwritten')
  assert m.digest(out)==preserved
 results.append({'case':'full audit '+mode,'passed':True})
copiedRubric=ROOT/'copied-rubric.md';copiedRubric.write_bytes(m.RUBRIC_PATH.read_bytes())
m.audit(ROOT/'dot',ROOT/'explicit-rubric-audit.json',copiedRubric)
results.append({'case':'explicit copied rubric path','passed':True})
badRubric=ROOT/'wrong-rubric.md';badRubric.write_text('synthetic wrong rubric')
try:m.audit(ROOT/'dot',ROOT/'wrong-rubric-audit.json',badRubric)
except AssertionError:pass
else:raise AssertionError('Wrong rubric was accepted')
assert not (ROOT/'wrong-rubric-audit.json').exists()
results.append({'case':'reject mismatched rubric hash','passed':True})
result={'status':'PASS','auditorSha256':m.digest(HELPER),'probes':len(results),'results':results,'fixtureRoot':str(ROOT),'limits':['Synthetic reference-integrity checks only; no quality grading or source/proposal execution.']}
out=P('/tmp/jev-blind-assessment-audit-v2-probe-results.json');out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'probes':result['probes'],'output':str(out),'auditorSha256':result['auditorSha256']}))
