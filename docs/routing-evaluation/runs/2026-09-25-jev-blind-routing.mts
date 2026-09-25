import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const [artifactPath, prefix] = process.argv.slice(2);
if (!artifactPath || !prefix) throw Error('Usage: artifact.json output-prefix');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const raw = readFileSync(artifactPath);
const artifact = JSON.parse(raw.toString());
if (artifact.status !== 'complete') throw Error('Assessment requires a completed retained batch.');
const { EXPERIMENT_TASKS } = await import('../../../examples/routing/experiment-tasks.ts');
const sourceHash = hash(raw);
const mapping: unknown[] = [];
const rows = artifact.trials.map((trial: any, index: number) => {
  const task = EXPERIMENT_TASKS.find((candidate: any) => candidate.id === trial.taskId);
  if (!task) throw Error('Unknown synthetic task.');
  const caseId = hash(sourceHash + '/' + index).slice(0, 24);
  mapping.push({caseId, artifactPath, artifactSha256: sourceHash, trialIndex: index, taskId: trial.taskId, baseId: trial.baseId, run: trial.run, arm: trial.arm});
  const p = trial.proposer;
  return {caseId, task: {intent: task.intent, files: task.files}, fixtureHostRevision: artifact.fixtureHostRevision ?? 'historical', output: p === null ? null : {
    status: p.status, answerPresent: Object.hasOwn(p, 'answer'), answer: p.answer ?? null,
    answerPossiblyClipped: typeof p.answer === 'string' && p.answer.length >= 20_000,
    tracePresent: Object.hasOwn(p, 'toolCalls'), traceTruncated: p.traceTruncated,
    toolCalls: p.toolCalls?.map((c: any) => ({tool: c.tool, status: c.status, ...(c.proposal ? {proposal: c.proposal} : {}), ...(c.testProposal ? {testProposal: c.testProposal} : {})})) ?? null,
  }};
}).sort((a: any,b: any) => a.caseId.localeCompare(b.caseId));
const blinded = rows.map((r: any) => JSON.stringify(r)).join('\n') + '\n';
writeFileSync(prefix + '.jsonl', blinded, {flag:'wx',mode:0o600});
writeFileSync(prefix + '-mapping.json', JSON.stringify({sourceHash, blindedSha256: hash(blinded), cases: mapping},null,2)+'\n', {flag:'wx',mode:0o600});
console.log(JSON.stringify({cases:rows.length,sourceHash,blindedSha256:hash(blinded)}));
