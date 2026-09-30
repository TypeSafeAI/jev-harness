import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '/Users/buns/Documents/GitHub/TypeSafeAI/typesafe-playground-wt/proposal-review-readiness/node_modules/playwright-core/index.mjs';

const cwd = '/Users/buns/Documents/GitHub/TypeSafeAI/jev-harness-wt/routing-host-recovery';
const load = (path: string) => import(pathToFileURL(resolve(cwd, path)).href);
const [{ createJevChoiceRouter }, { routeTools }, { DEMO_CATALOG, DEMO_POLICY }, { ARENA_CASES }] = await Promise.all([
  load('examples/host/jev-choice.ts'), load('src/routing/index.ts'), load('examples/routing/scenarios.ts'), load('examples/arena/cases.ts'),
]);
const baseURL = 'http://127.0.0.1:4208';
const output = '/tmp/jev-performance-2026-09-24/recovery-browser-cards';
await mkdir(output, { recursive: true });
const checks: string[] = [], errors: string[] = [];
let mode: 'recovered' | 'exhausted' | 'partial' | 'malformed_final' = 'recovered', syntheticDispatches = 0;
const check = (condition: unknown, description: string) => { assert(condition, description); checks.push(description); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext();
  await context.route('**/api/**', route => route.request().url().endsWith('/api/config')
    ? route.fulfill({ json: { live: true, serverKey: true } }) : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/arena', async route => {
    const fixture = ARENA_CASES.find((item: any) => item.id === route.request().postDataJSON().caseId);
    assert(fixture);
    const progress: any[] = [];
    let count = 0;
    const host = createJevChoiceRouter({ key: 'synthetic-placeholder', recovery: 'probability_sum_only_v1', onMeasurement: (measurement: any) => progress.push(structuredClone(measurement)),
      fetch: async (_url: unknown, init: any) => {
        count++; syntheticDispatches++;
        const body = JSON.parse(init.body), ids = Object.keys(body.questions.tool.criteria);
        const probabilities = Object.fromEntries(ids.map(id => [id, 0]));
        probabilities.read_file = mode === 'exhausted' || count < 3 ? .99 : 1;
        return Response.json({ model: 'jev-1.13.0', answers: { tool: { type: 'choice', choice: 'read_file', confidence: probabilities.read_file, probabilities } }, usage: { input_tokens: 100, output_tokens: 10 } });
      } });
    const receipt = await routeTools(DEMO_CATALOG, { intent: fixture.task, availableIds: DEMO_CATALOG.map((tool: any) => tool.id) }, DEMO_POLICY, host.router);
    assert.equal(count, 3);
    const measurement = host.state.measurement;
    const at = new Date().toISOString();
    const result = { status: 'completed', answer: 'Synthetic browser verification answer. No proposed source was executed.', durationMs: 1000, inputTokens: 1000, cachedInputTokens: 0, outputTokens: 30,
      toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: 'read_file', status: 'returned', at }], error: null };
    const events = mode === 'partial' || mode === 'malformed_final'
      ? [{ type: 'routing_usage', version: 1, measurement: progress.find(m => m.attemptLedger.attempts.length === 2 && m.attemptLedger.attempts[1].status === 'pending') }, ...(mode === 'malformed_final' ? [{ type: 'usage', attempted: true, measurement: { ...measurement, inputTokens: 'malformed' } }] : [])]
      : [{ type: 'usage', attempted: true, measurement, error: mode === 'exhausted' ? 'Probability sum remained invalid.' : null }, ...(mode === 'exhausted'
        ? [{ type: 'error', value: 'Jev evidence unavailable. No CLI run started.' }]
        : [{ type: 'routing', receipt }, { type: 'result', lane: 'baseline', tools: DEMO_CATALOG.map((tool: any) => tool.id), result },
          { type: 'result', lane: 'integrated', tools: ['read_file'], result: { ...result, inputTokens: 500 } }, { type: 'done' }])];
    assert(events.every(event => event.type !== 'routing_usage' || event.measurement));
    await route.fulfill({ contentType: 'application/x-ndjson', body: events.map(event => JSON.stringify(event)).join('\n') + '\n' });
  });
  const openDetails = async () => { await page.locator('.run-inspector > .detail-trigger').click(); await page.getByRole('tab', { name: 'Usage', exact: true }).click(); };
  const closeDetails = () => page.getByRole('button', { name: 'Close details', exact: true }).click();
  const run = async () => { await page.getByRole('button', { name: /^Run comparison/ }).click(); await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.arena-controls button.primary')!.disabled); };
  const download = async () => {
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download comparison', exact: true }).click();
    const stream = await (await event).createReadStream(); let text = ''; for await (const chunk of stream!) text += chunk;
    return JSON.parse(text);
  };
  await page.goto(baseURL);
  await run(); await openDetails();
  const text = () => page.locator('#inspect-panel').innerText();
  check(/Physical requests:\s*3/.test(await text()), 'Recovered call shows all three physical requests');
  check(/Logical routing calls:\s*1/.test(await text()), 'Logical call count remains one');
  await page.locator('#inspect-panel .routing-attempts summary').click();
  check((await text()).includes('0.99'), 'Failed probability totals remain visible');
  check((await page.locator('#inspect-panel .routing-attempt-card').count()) === 3, 'All failed and successful attempts remain inspectable');
  const saved = await download();
  check(saved.jevUsage.attemptLedger.attempts.length === 3 && saved.jevUsage.inputTokens === 300 && saved.jevUsage.outputTokens === 30, 'Download includes complete attempt ledger and whole-call usage');
  check(saved.setupVersion === 7 && saved.applied === false, 'Recovery cohort is distinct and remains nonexecuting');
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Recovery details fit ${width}px`);
    check(await page.locator('#inspect-panel .routing-attempt-metrics dt').evaluateAll(nodes => nodes.every(node => {
      const rect = node.getBoundingClientRect(); return rect.width >= 110 && rect.height < 34;
    })), `Attempt labels remain readable at ${width}px`);
    if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/recovery-${width}.png`, fullPage: true });
  }
  await closeDetails(); await page.reload(); await openDetails();
  const reloaded = await download();
  check(JSON.stringify(reloaded.jevUsage) === JSON.stringify(saved.jevUsage), 'History reload preserves every attempt and its usage');
  await closeDetails();
  await page.locator('#usage-open').click();
  check(await page.locator('#usage-requests').innerText() === '1' && await page.locator('#usage-input').innerText() === '300', 'Usage dashboard counts one call with all attempt input');
  check(/Physical requests:\s*3/.test(await page.locator('#usage-dialog').innerText()), 'Usage dashboard distinguishes physical requests');
  await page.getByRole('button', { name: 'Close usage dashboard' }).click();

  mode = 'exhausted'; await run(); await openDetails();
  check(/Physical requests:\s*3/.test(await text()), 'Exhausted routing displays paid work even without CLI lanes');
  const failed = await download();
  check(Object.keys(failed.lanes).length === 0 && failed.jevUsage.attemptLedger.stopReason === 'exhausted' && failed.jevUsage.inputTokens === 300, 'Failed run download retains all routing costs and no invented CLI result');
  await closeDetails();

  mode = 'partial'; await run(); await openDetails();
  check(/Physical requests:\s*Unknown/.test(await text()) && /2 observed/.test(await text()), 'Interrupted stream shows unknown total and observed lower bound');
  const partial = await download();
  check(!partial.jevUsage.attemptLedger.complete && partial.jevUsage.attemptLedger.attempts.length === 2 && partial.jevUsage.inputTokens === null, 'Interrupted run retains partial ledger without fabricating final usage');
  await closeDetails(); await page.reload(); await openDetails();
  check(!(await download()).jevUsage.attemptLedger.complete, 'Partial attempt history survives reload');
  await closeDetails(); await page.locator('#usage-open').click();
  check(await page.locator('#usage-requests').innerText() === '3' && await page.locator('#usage-input').innerText() === '700', 'Reported subtotal includes earlier failed work without double-counting progress events');
  check(/Physical requests:\s*Unknown/.test(await page.locator('#usage-dialog').innerText()), 'Incomplete usage prevents a known physical-request total');
  await page.getByRole('button', { name: 'Close usage dashboard' }).click();
  mode = 'malformed_final'; await run(); await openDetails();
  const malformed = await download();
  check(!malformed.jevUsage.attemptLedger.complete && malformed.jevUsage.attemptLedger.attempts.length === 2, 'Malformed terminal telemetry preserves the last observed partial ledger');
  await closeDetails(); await page.locator('#usage-open').click();
  check(await page.locator('#usage-requests').innerText() === '4' && await page.locator('#usage-input').innerText() === '800', 'Malformed terminal telemetry does not erase or double-count observed usage');
  check(errors.length === 0, 'No browser runtime errors');
  const result = { checks, count: checks.length, providerCalls: 0, cliCalls: 0, syntheticDispatches, humanAccessibilityAcceptance: 'not performed' };
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify(result) + '\n');
} finally { await browser.close(); }
