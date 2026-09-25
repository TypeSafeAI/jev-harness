"""Join frozen blinded annotations after assessment; no provider or proposal execution."""
import collections, hashlib, json, pathlib, statistics, sys

prefix, output = map(pathlib.Path, sys.argv[1:])
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read(suffix): return json.loads(pathlib.Path(str(prefix) + suffix).read_text())
mapping = read('-mapping.json')
assessment = read('-assessments.json')
blind_path = pathlib.Path(str(prefix) + '.jsonl')
blinded = [json.loads(line) for line in blind_path.read_text().splitlines()]
source_path = pathlib.Path(mapping['cases'][0]['artifactPath'])
artifact = json.loads(source_path.read_text())
assert digest(source_path) == mapping['sourceHash']
assert digest(blind_path) == mapping['blindedSha256'] == assessment['inputSha256']
assert assessment['rubricSha256'] == 'b90742ed9c4367f1ad8282a2d48349a69401e4fe077ebb6616301c3950109ce4'
by_id = {row['caseId']: row for row in assessment['cases']}
assert len(by_id) == len(assessment['cases']) == len(blinded) == len(mapping['cases']) == len(artifact['trials'])
assert set(by_id) == {row['caseId'] for row in blinded} == {row['caseId'] for row in mapping['cases']}
assert {row['trialIndex'] for row in mapping['cases']} == set(range(len(artifact['trials'])))
rows = []
for m in mapping['cases']:
    t = artifact['trials'][m['trialIndex']]
    assert all(t[key] == m[key] for key in ['taskId', 'baseId', 'run', 'arm'])
    assert m['artifactSha256'] == mapping['sourceHash']
    assert m['caseId'] == hashlib.sha256((mapping['sourceHash'] + '/' + str(m['trialIndex'])).encode()).hexdigest()[:24]
    a = by_id[m['caseId']]
    assert a['contentQuality'] in ['meets', 'partial', 'fails', 'unassessable']
    rows.append({'caseId': m['caseId'], 'trialIndex': m['trialIndex'], 'taskId': t['taskId'], 'baseId': t['baseId'], 'run': t['run'], 'arm': t['arm'], 'outcome': t['outcome'], 'assessment': a})

def counts(subset):
    return {'trials': len(subset), 'contentQuality': {q: sum(r['assessment']['contentQuality'] == q for r in subset) for q in ['meets', 'partial', 'fails', 'unassessable']},
            'outcomes': dict(collections.Counter(r['outcome'] for r in subset)),
            'constraintViolations': sum(bool(r['assessment']['constraintViolation']) for r in subset)}
groups = {arm: {base: counts([r for r in rows if r['arm'] == arm and (base == 'total' or r['baseId'] == base)])
          for base in ['total'] + list(artifact['labels'])} for arm in ['all_tools', 'jev_top_k']}

def metric(trial, field):
    p, routing = trial['proposer'], trial['routing']
    if not p or p['reported'][field] is None: return None
    if field == 'cachedInput': return p['reported'][field]
    if routing and (routing['reported'] is None or routing['reported'][field] is None): return None
    return p['reported'][field] + (routing['reported'][field] if routing else 0)

paired = []
for run, task_id in sorted({(r['run'], r['taskId']) for r in rows}):
    pair = {r['arm']: r for r in rows if r['run'] == run and r['taskId'] == task_id}
    if len(pair) != 2: continue
    if not all(r['assessment']['contentQuality'] == 'meets' and not r['assessment']['constraintViolation'] and r['outcome'] == 'tool_called' for r in pair.values()): continue
    if not all(r['assessment']['grounding'] == 'source-access call returned, exact access unretained' for r in pair.values()): continue
    paired.append({'run': run, 'taskId': task_id, 'baseId': pair['all_tools']['baseId'], **{
        arm: {field: metric(artifact['trials'][row['trialIndex']], field) for field in ['input', 'cachedInput', 'output']}
        for arm, row in pair.items()}})
pair_groups = {}
for base in ['total'] + list(artifact['labels']):
    subset = [p for p in paired if base == 'total' or p['baseId'] == base]
    pair_groups[base] = {'pairs': len(subset), 'metrics': {field: {
        'knownPairs': sum(p['all_tools'][field] is not None and p['jev_top_k'][field] is not None for p in subset),
        **{arm: statistics.mean(p[arm][field] for p in subset if p['all_tools'][field] is not None and p['jev_top_k'][field] is not None)
           if any(p['all_tools'][field] is not None and p['jev_top_k'][field] is not None for p in subset) else None for arm in ['all_tools', 'jev_top_k']}}
        for field in ['input', 'cachedInput', 'output']}}
result = {'schemaVersion': 1, 'kind': 'supplementary-routing-output-assessment', 'artifactFile': source_path.name,
          'artifactSha256': digest(source_path), 'blindedSha256': digest(blind_path), 'rubricSha256': assessment['rubricSha256'],
          'assessmentSha256': digest(pathlib.Path(str(prefix) + '-assessments.json')), 'joinScriptSha256': digest(pathlib.Path(__file__)),
          'assessor': assessment['assessor'], 'groups': groups, 'pairedGroundedMeetsUsage': pair_groups, 'pairedCases': paired, 'cases': rows,
          'limitations': ['Blinded agent code reading, not validated human gold or held-out calibration.',
            'Content, grounding, delivery and operational status are separate; route-only outputs remain unassessable.',
            'Paired usage excludes non-equivalent outputs and states its denominator; all outcomes remain in groups and cases.',
            'Input/output include Jev when called. cachedInput is proposer-only; no Jev cache count is known.',
            'Token means do not establish dollar savings. Overlapping batches do not establish isolated latency.']}
with output.open('x') as handle: json.dump(result, handle, indent=2); handle.write('\n')
print(json.dumps({'file': str(output), 'trials': len(rows), 'groups': {arm: groups[arm]['total'] for arm in groups}, 'paired': pair_groups['total']}))
