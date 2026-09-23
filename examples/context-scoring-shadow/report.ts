import type { ContextShadowArtifact, LayoutResult, RequestLayout } from "./types.js";

export type ReportFormat = "json" | "markdown";

export function parseReportFormat(args: readonly string[]): ReportFormat {
  let format: ReportFormat = "json";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--format") {
      const value = args[index + 1];
      if (value !== "json" && value !== "markdown") {
        throw new Error("Usage: pnpm experiment:context-shadow [--format json|markdown]");
      }
      format = value;
      index += 1;
    } else {
      // In particular, no live option is accepted by this offline example.
      throw new Error(`Unsupported option: ${argument ?? ""}. Usage: pnpm experiment:context-shadow [--format json|markdown]`);
    }
  }
  return format;
}

function list(ids: readonly string[]): string {
  return ids.length ? ids.map(id => `\`${id}\``).join(", ") : "none";
}

function percentage(value: number | null): string {
  return value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
}

function markdownInline(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\`*_{}\[\]()#+.!|<>~-]/g, "\\$&");
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...Array.from(value.matchAll(/`+/g), match => match[0].length));
}

function formatCost(result: LayoutResult): string {
  if (result.costEstimate.status === "unknown") {
    return `Unknown (${result.costEstimate.reason}).`;
  }
  const cost = result.costEstimate;
  return `Illustrative estimate: baseline proposer $${cost.baselineProposerUsd!.toFixed(8)}, counterfactual proposer $${cost.counterfactualProposerUsd!.toFixed(8)}, scoring $${cost.scoringUsd!.toFixed(8)}, net $${cost.netSavingsUsd!.toFixed(8)}. Assumptions dated ${cost.assumptions!.asOf}; synthetic observations only.`;
}

function layoutMarkdown(name: string, layout: RequestLayout, result: LayoutResult): string[] {
  const failed = result.failures.length
    ? result.failures.map(failure => `${failure.requestId}: ${failure.code}`).join("; ")
    : "none";
  const evidence = result.evidence.map(row =>
    `| \`${row.chunkId}\` | ${row.probability === null ? "unavailable" : String(row.probability)} | ${row.classification} |`,
  );
  return [
    `### ${name} (${layout})`,
    "",
    `Status: **${result.status}**. Proposed keep: ${list(result.proposedKeepIds)}. Proposed drop: ${list(result.proposedDropIds)}.`,
    `Uncertain: ${list(result.uncertainIds)}. Relevance recall: ${percentage(result.relevanceRecall)}.`,
    `Failures: ${failed}.`,
    `Context proxy: ${result.metrics.originalContextBytes} → ${result.metrics.proposedContextBytes} UTF-8 bytes; ${result.metrics.originalContextTokenProxy} → ${result.metrics.proposedContextTokenProxy} tokens at ceil(bytes/4). These are proxies, not provider token counts.`,
    `Planned scoring requests: ${result.metrics.plannedRequestCount}; ${result.metrics.plannedRequestBytes} request bytes; ${result.metrics.plannedRequestTokenProxy} estimated tokens at ceil(bytes/4).`,
    `Cost: ${formatCost(result)}`,
    "",
    "| Chunk | Noul probability | Evidence |",
    "| --- | ---: | --- |",
    ...evidence,
    "",
  ];
}

/** Render the summary and the exact versioned machine artifact from one result. */
export function renderMarkdownReport(artifact: ContextShadowArtifact): string {
  const json = JSON.stringify(artifact, null, 2);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(json) + 1));
  const lines = [
    "# Context scoring shadow experiment",
    "",
    `**Provenance:** ${artifact.provenance.label}; adapter \`${artifact.provenance.adapter}\`; live: ${artifact.provenance.live}.`,
    `**Model:** \`${artifact.model}\`. **Question set:** \`${artifact.questionSetVersion}\`. **Thresholds:** below ${artifact.thresholds.dropBelow} would drop; ${artifact.thresholds.dropBelow} through ${artifact.thresholds.relevantAbove} is uncertain and retained; above ${artifact.thresholds.relevantAbove} is relevant and retained.`,
    "",
    `Task: ${markdownInline(artifact.input.task)}`,
    "",
    "This is an offline shadow result. The source context was not changed; incomplete evidence keeps every chunk and makes no drop recommendation.",
    "",
    ...layoutMarkdown("All chunks, one Noul per chunk", "fan_out", artifact.layouts.fan_out),
    ...layoutMarkdown("One request per chunk", "per_chunk", artifact.layouts.per_chunk),
    "## Versioned JSON artifact",
    "",
    "The JSON below is the complete artifact represented by this report.",
    "",
    `${fence}json`,
    json,
    fence,
    "",
  ];
  return lines.join("\n");
}

export function renderReport(artifact: ContextShadowArtifact, format: ReportFormat): string {
  return format === "markdown"
    ? renderMarkdownReport(artifact)
    : `${JSON.stringify(artifact, null, 2)}\n`;
}
