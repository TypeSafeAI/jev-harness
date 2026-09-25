import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { routeTools } from '/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness-wt/routing-v4-integration/src/routing/index.ts';
import { EXPERIMENT_CATALOG, EXPERIMENT_TASKS, EXPERIMENT_LABELS, TIER_AVAILABLE_IDS } from '/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness-wt/routing-v4-integration/examples/routing/experiment-tasks.ts';
import { parseExperimentArtifact } from '/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness-wt/routing-v4-integration/examples/routing/experiment.ts';
import { jevChoiceBody } from '/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness-wt/routing-v4-integration/examples/host/jev-choice.ts';

async function main() {
  const artifactPath = '/tmp/jev-performance-2026-09-24/routing-evidence-v4-attempt3.json';
  const measured = JSON.parse(await readFile(artifactPath, 'utf8'));
  assert.equal(measured.sourceCommit, 'fb7226c1c8b04efb0385ce3bef0d072e67f78899');
  assert.equal(measured.trials.length, 57);
  assert.deepEqual(measured.labels, EXPERIMENT_LABELS);
  const seen = new Set<string>();
  for (const trial of measured.trials) {
    const task = EXPERIMENT_TASKS.find(t => t.id === trial.taskId);
    assert.ok(task);
    assert.equal(task.baseId, trial.baseId);
    assert.equal(task.size, trial.size);
    const key = `${trial.run}/${task.id}`;
    assert.ok(!seen.has(key));
    seen.add(key);
    let calls = 0;
    const replay = await routeTools(EXPERIMENT_CATALOG, { intent: task.intent, availableIds: TIER_AVAILABLE_IDS[task.size] }, measured.policy, {
      source: 'jev',
      review: async query => {
        calls++;
        assert.equal(jevChoiceBody(query), trial.requestBody, `exact wire body: ${key}`);
        assert.deepEqual(query, trial.receipt.request, `request: ${key}`);
        return trial.receipt.evidence;
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(replay.catalog, trial.receipt.catalog, `catalog: ${key}`);
    assert.deepEqual(replay.policy, trial.receipt.policy, `policy: ${key}`);
    assert.equal(replay.outcome, trial.receipt.outcome, `outcome: ${key}`);
    assert.deepEqual(replay.selectedIds, trial.receipt.selectedIds, `selected ids: ${key}`);
  }
  const historical: string[] = [];
  const paths = (await readdir('examples/routing/runs')).filter(f => f.endsWith('.json')).map(f => `examples/routing/runs/${f}`);
  paths.push(...[1, 2, 3].map(v => `tests/fixtures/routing-v${v}-prerequisites.json`));
  for (const path of paths) {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    if (raw.kind !== 'routing-experiment') continue;
    const before = JSON.stringify(raw);
    assert.deepEqual(await parseExperimentArtifact(raw), raw, path);
    assert.equal(JSON.stringify(raw), before, path);
    historical.push(path);
  }
  const result = { sourceArtifact: artifactPath, sourceCommit: measured.sourceCommit, matchedRequestBodies: seen.size, matchedRequestsCatalogsPoliciesAndOutcomes: seen.size, historicalArtifactsReplayed: historical, providerCalls: 0, cliCalls: 0 };
  await writeFile('/tmp/jev-routing-v4-integration-audit.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
