import { compareScenario } from "../examples/routing/compare.js";
import { SCENARIOS } from "../examples/routing/scenarios.js";
const rows = [];
for (const scenario of SCENARIOS) {
  const start = performance.now();
  const comparison = await compareScenario(scenario);
  rows.push({ ...comparison, localComparisonMs: performance.now() - start });
}
console.log(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), command: "pnpm bench:routing", source: "mock", notes: "Scripted synthetic evidence. Token estimates = ceil(UTF-8 bytes / 4), not provider usage. Local comparison timing is not execution or Jev latency. Full baseline measures tool inclusion, not model selection accuracy.", rows }, null, 2));
if (rows.some(row => !row.expectationMet)) process.exitCode = 1;
