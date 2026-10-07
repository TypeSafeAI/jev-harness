import { DEMO_INPUT, scriptedFakeAdapter } from "./demo.js";
import { runContextShadowExperiment } from "./experiment.js";
import { CONTEXT_SHADOW_USAGE, parseReportFormat, renderReport, type ReportFormat } from "./report.js";

export { CONTEXT_SHADOW_USAGE };

export interface ContextShadowCliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Offline only: 2 is a usage error, 1 a run failure, 0 a written report. */
export async function main(argv: readonly string[], io: ContextShadowCliIo): Promise<number> {
  let format: ReportFormat;
  try { format = parseReportFormat(argv); }
  catch (error) { io.stderr(`${(error as Error).message}\n`); return 2; }
  try {
    const artifact = await runContextShadowExperiment(DEMO_INPUT, scriptedFakeAdapter);
    io.stdout(renderReport(artifact, format));
    return 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : "Context shadow experiment failed."}\n`);
    return 1;
  }
}
