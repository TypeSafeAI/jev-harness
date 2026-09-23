/** Markdown results table, recomputed from an artifact's raw trials and labels (never from its stored summary). */
import { ARMS, summarizeExperiment, type Arm, type ArmSummary, type ExperimentArtifact } from "./experiment.js";

const ARM_LABEL: Record<Arm, string> = { all_tools: "A · all N schemas", jev_top_k: "B · Jev top-k" };
const n = (v: number | null, digits = 0) => v === null ? "n/a" : v.toFixed(digits);
const pct = (s: ArmSummary) => s.correctRate === null ? "n/a" : `${s.correct}/${s.correctKnown} (${(s.correctRate * 100).toFixed(0)}%)${s.correctKnown === s.trials ? "" : ` · ${s.trials - s.correctKnown} unknown`}`;
const reported = (s: ArmSummary, v: number | null, known = s.reportedInputKnown) => { const missing = s.trials - known; return v === null ? `unknown (${missing}/${s.trials})` : missing ? `${n(v)} (${missing} unknown)` : n(v); };
const row = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;

export function renderExperimentTable(artifact: ExperimentArtifact): string {
  const summary = summarizeExperiment(artifact.trials, artifact.labels);
  const lines: string[] = [];
  const banner = artifact.source === "fake"
    ? "> **FAKE RUN — scripted Jev and scripted proposer. These numbers are not measurements.**"
    : `> Live run, Jev \`${artifact.models.jev}\`, proposer: ${artifact.models.proposer}. One run is a signal, not a calibration.`;
  lines.push(`### Routing experiment: N tools in context vs Jev top-k`, "", banner, "",
    `Generated ${artifact.generatedAt} · \`${artifact.command}\` · runs: ${artifact.runs} · sizes: ${artifact.sizes.join(", ")} · topK ${artifact.policy.topK}, confidence floor ${artifact.policy.confidenceFloor}`, "");

  if (artifact.status === "cancelled") lines.push("> **Cancelled: partial results only. Planned runs did not finish.**", "");
  lines.push("#### Totals by arm", "",
    row(["Arm", "Trials", "Correct tool", "First call correct", "Routed clarify / no-match", "No tool call", "Unavailable", "Failed", "Jev calls", "Jev latency median (ms)", "Reported input mean", "Reported output mean", "Proxy input mean", "Tools exposed mean"]),
    row(Array(14).fill("---")));
  for (const arm of ARMS) {
    const s = summary.byArm[arm];
    lines.push(row([ARM_LABEL[arm], String(s.trials), pct(s), String(s.firstCallCorrect), String(s.routedClarifications), String(s.noToolCalls), String(s.unavailable), String(s.failed), String(s.jevCalls), n(s.jevLatencyMedianMs, 1), reported(s, s.reportedInputMean), reported(s, s.reportedOutputMean, s.reportedOutputKnown), n(s.proxyInputMean), n(s.exposedToolsMean, 1)]));
  }

  lines.push("", "#### By catalog size", "", row(["Size", "N", "Arm", "Correct tool", "Reported input mean", "Proxy input mean"]), row(Array(6).fill("---")));
  for (const size of summary.bySize) for (const arm of ARMS) {
    const s = size.arms[arm];
    lines.push(row([size.size, String(size.catalogSize), ARM_LABEL[arm], pct(s), reported(s, s.reportedInputMean), n(s.proxyInputMean)]));
  }

  lines.push("", "#### Paired per task", "", row(["Task", "N", "A correct", "B correct", "A reported input", "B reported input (incl. Jev)", "A proxy input", "B proxy input (incl. Jev)"]), row(Array(8).fill("---")));
  for (const p of summary.paired) {
    const a = p.arms.all_tools, b = p.arms.jev_top_k;
    lines.push(row([p.taskId, String(p.catalogSize), pct(a), pct(b), reported(a, a.reportedInputMean), reported(b, b.reportedInputMean), n(a.proxyInputMean), n(b.proxyInputMean)]));
  }

  lines.push("", "Correct tool: a task labelled *selected* counts when the proposer completed and called an acceptable tool; a task labelled *clarify* counts when no tool was called. Reported usage is provider-returned; *unknown* is never counted as zero. Proxy input is `ceil(UTF-8 bytes / 4)` of the prompt, exposed schemas and Jev request; it is not provider usage or a saving.",
    "", ...artifact.notes.map(note => `- ${note}`), "");
  return lines.join("\n");
}
