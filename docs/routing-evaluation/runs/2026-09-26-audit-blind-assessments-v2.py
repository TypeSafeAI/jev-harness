"""Audit frozen assessment identities and exact field excerpts; never grade or execute output."""
import hashlib
import json
import pathlib
import re
import sys

RUBRIC_PATH = pathlib.Path('/tmp/jev-routing-output-rubric-v2.md')
RUBRIC_SHA256 = 'b90742ed9c4367f1ad8282a2d48349a69401e4fe077ebb6616301c3950109ce4'
INDEX = re.compile(r'(?:0|[1-9][0-9]*)\Z')
SEGMENT = re.compile(r'([A-Za-z_][A-Za-z0-9_]*|0|[1-9][0-9]*)(\[(?:0|[1-9][0-9]*)\])*\Z')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_path(value):
    """Accept dotted fields/indices and canonical bracket indices, without eval."""
    assert isinstance(value, str) and value, 'Evidence field must be a nonempty path.'
    tokens = []
    for segment in value.split('.'):
        assert SEGMENT.fullmatch(segment), 'Malformed evidence field path.'
        field = segment.split('[', 1)[0]
        tokens.append(field)
        tokens.extend(re.findall(r'\[([0-9]+)\]', segment))
    return tokens


def select(value, path):
    if not path:
        return [value]
    token = path[0]
    if isinstance(value, list):
        if INDEX.fullmatch(token):
            # An explicit index is consumed once. Never fall back to another element.
            index = int(token)
            return select(value[index], path[1:]) if index < len(value) else []
        # Preserve the original implicit wildcard: toolCalls.proposal.patch.
        return [part for element in value for part in select(element, path)]
    if isinstance(value, dict) and token in value:
        return select(value[token], path[1:])
    return []


def audit(prefix, output_path=None, rubric_path=None):
    prefix = pathlib.Path(prefix)
    blind_path = pathlib.Path(str(prefix) + '.jsonl')
    annotation_path = pathlib.Path(str(prefix) + '-assessments.json')
    blinded = [json.loads(line) for line in blind_path.read_text().splitlines()]
    annotations = json.loads(annotation_path.read_text())
    assert annotations['inputSha256'] == digest(blind_path)
    rubric = pathlib.Path(rubric_path) if rubric_path is not None else RUBRIC_PATH
    assert annotations['rubricSha256'] == digest(rubric) == RUBRIC_SHA256
    rows = {row['caseId']: row for row in blinded}
    assert len(rows) == len(blinded) == len(annotations['cases']) == 114
    assert set(rows) == {row['caseId'] for row in annotations['cases']}

    for case in annotations['cases']:
        assert case['contentQuality'] in ['meets', 'partial', 'fails', 'unassessable']
        assert all(key in case for key in ['evidence', 'evidenceField', 'grounding', 'delivery', 'constraintViolation', 'reason'])
        values = select(rows[case['caseId']], parse_path(case['evidenceField']))
        representations = []
        for value in values:
            if isinstance(value, str):
                representations.append(value)
            else:
                representations.extend([json.dumps(value, ensure_ascii=False), json.dumps(value, separators=(',', ':'), ensure_ascii=False), json.dumps(value, indent=2, ensure_ascii=False)])
        assert isinstance(case['evidence'], str) and case['evidence'] and any(case['evidence'] in text for text in representations), (case['caseId'], case['evidenceField'], 'Exact field excerpt not found.')
        if rows[case['caseId']]['output'] is None:
            assert case['contentQuality'] == 'unassessable'

    result = {'auditVersion': 2, 'auditorSha256': digest(pathlib.Path(__file__)),
              'inputFile': blind_path.name, 'inputSha256': digest(blind_path), 'assessmentSha256': digest(annotation_path),
              'rubricSha256': annotations['rubricSha256'], 'uniqueCases': 114, 'exactFieldExcerptsMatched': 114,
              'note': 'Offline identity, hash and exact excerpt validation; this does not validate the human-equivalent correctness of the agent grades.'}
    out = pathlib.Path(output_path) if output_path is not None else pathlib.Path(str(prefix) + '-assessment-audit.json')
    with out.open('x') as handle:
        json.dump(result, handle, indent=2)
        handle.write('\n')
    return result


if __name__ == '__main__':
    assert len(sys.argv) in (2, 3, 4), 'Usage: auditor PREFIX [FRESH_AUDIT_OUTPUT [RUBRIC_PATH]]'
    print(json.dumps(audit(sys.argv[1], sys.argv[2] if len(sys.argv) >= 3 else None, sys.argv[3] if len(sys.argv) == 4 else None)))
