import { DEMO_INPUT, scriptedFakeAdapter } from "./demo.js";
import { runContextShadowExperiment } from "./experiment.js";
import { parseReportFormat, renderReport } from "./report.js";

async function main(): Promise<void> {
  const format = parseReportFormat(process.argv.slice(2));
  const artifact = await runContextShadowExperiment(DEMO_INPUT, scriptedFakeAdapter);
  process.stdout.write(renderReport(artifact, format));
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "Context shadow experiment failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
