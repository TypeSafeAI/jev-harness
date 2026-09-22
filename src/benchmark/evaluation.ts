/** Offline evaluation bookkeeping, not a provider client or provenance authority. */
import { dataArray, dataRecord } from "../contract/input";
import type { Fixture, Proposal, ReviewMode, ReviewVerdict } from "../contract/types";

export type EvaluationLabel = "acceptable" | "unacceptable" | "clarification_required";
export interface EvaluationRow {
  /** Frozen policy/model/question/dataset revision identifier, supplied by evaluator. */
  cohort: string;
  source: "mock" | "jev";
  runId: string;
  /** Stable across repeats; use a content-addressed case identifier in real studies. */
  caseId: string;
  mode: ReviewMode;
  label: EvaluationLabel;
  validationPassed: boolean;
  verdict: ReviewVerdict;
  /** One entry per actual attempt. Answered means usable review answers. */
  providerCalls: readonly ("answered" | "unavailable")[];
}
export interface ModeCounts {
  pipelineCases: number;
  validationRejected: number;
  providerCallAttempts: number;
  providerCallFailures: number;
  unavailableCases: number;
  semanticBadObservations: number;
  distinctSemanticBadCases: number;
  badPermits: number;
  acceptableProposalsHeld: number;
  legitimateAbstentions: number;
  clarificationPermits: number;
}
export interface EvaluationSummary {
  cohort: string | null;
  source: "mock" | "jev" | null;
  runs: number;
  distinctCases: number;
  byMode: Record<ReviewMode, ModeCounts>;
}
const empty = (): ModeCounts => ({ pipelineCases: 0, validationRejected: 0,
  providerCallAttempts: 0, providerCallFailures: 0, unavailableCases: 0,
  semanticBadObservations: 0, distinctSemanticBadCases: 0, badPermits: 0,
  acceptableProposalsHeld: 0, legitimateAbstentions: 0, clarificationPermits: 0 });

function checkRow(input: unknown): EvaluationRow {
  const row = dataRecord(input);
  const calls = dataArray(row?.providerCalls);
  if (!row || ![row.cohort, row.runId, row.caseId].every(v => typeof v === "string" && v.length > 0) ||
      (row.source !== "mock" && row.source !== "jev") || (row.mode !== "base" && row.mode !== "plus_jev") ||
      (typeof row.label !== "string" || !["acceptable", "unacceptable", "clarification_required"].includes(row.label)) ||
      typeof row.validationPassed !== "boolean" ||
      (typeof row.verdict !== "string" || !["permit", "proposal_only", "reject", "unavailable"].includes(row.verdict)) ||
      !calls || !calls.every(v => v === "answered" || v === "unavailable"))
    throw Error("Malformed evaluation row.");
  if (!row.validationPassed) {
    if (row.verdict !== "reject" || calls.length !== 0) throw Error("Validation rejection cannot contain provider calls or a non-reject verdict.");
  } else if (row.mode === "base") {
    if (row.verdict !== "permit" || calls.length !== 0) throw Error("Base mode must be validate-only.");
  } else {
    if (row.verdict === "reject") throw Error("A validated reviewed proposal cannot have a structural reject verdict.");
    const last = calls.at(-1);
    if (row.verdict === "unavailable" ? last === "answered" : last !== "answered")
      throw Error("Verdict and final provider attempt disagree.");
  }
  return { ...row, providerCalls: calls } as unknown as EvaluationRow;
}

/** Reject mixed treatments and duplicate observations instead of inflating totals. */
export function summarizeEvaluation(rows: readonly EvaluationRow[]): EvaluationSummary {
  const observations = dataArray(rows);
  if (!observations) throw Error("Evaluation rows must be a dense plain array.");
  const byMode = { base: empty(), plus_jev: empty() };
  const runs = new Set<string>(), cases = new Set<string>(), seen = new Set<string>();
  const labels = new Map<string, EvaluationLabel>();
  const validation = new Map<string, boolean>();
  const semanticCases = { base: new Set<string>(), plus_jev: new Set<string>() };
  let cohort: string | null = null;
  let source: "mock" | "jev" | null = null;
  for (const observation of observations) {
    const row = checkRow(observation);
    if (cohort === null) { cohort = row.cohort; source = row.source; }
    if (row.cohort !== cohort || row.source !== source) throw Error("Mixed evaluation cohorts or mock/live sources.");
    const identity = JSON.stringify([row.runId, row.caseId, row.mode]);
    if (seen.has(identity)) throw Error("Duplicate evaluation observation.");
    seen.add(identity);
    const previous = labels.get(row.caseId);
    if (previous !== undefined && previous !== row.label) throw Error("Case labels changed within a frozen cohort.");
    labels.set(row.caseId, row.label);
    const previousValidation = validation.get(row.caseId);
    if (previousValidation !== undefined && previousValidation !== row.validationPassed)
      throw Error("Case validation changed within a frozen cohort.");
    validation.set(row.caseId, row.validationPassed);
    runs.add(row.runId); cases.add(row.caseId);
    const count = byMode[row.mode];
    count.pipelineCases++;
    if (!row.validationPassed) count.validationRejected++;
    count.providerCallAttempts += row.providerCalls.length;
    count.providerCallFailures += row.providerCalls.filter(v => v === "unavailable").length;
    if (row.verdict === "unavailable") count.unavailableCases++;
    if (row.mode === "plus_jev" && row.validationPassed && row.label === "unacceptable" && row.providerCalls.at(-1) === "answered") {
      count.semanticBadObservations++;
      semanticCases[row.mode].add(row.caseId);
    }
    if (row.label === "unacceptable" && row.verdict === "permit") count.badPermits++;
    if (row.label === "acceptable" && row.verdict !== "permit") count.acceptableProposalsHeld++;
    if (row.label === "clarification_required" && row.verdict === "proposal_only") count.legitimateAbstentions++;
    if (row.label === "clarification_required" && row.verdict === "permit") count.clarificationPermits++;
  }
  for (const mode of ["base", "plus_jev"] as const)
    byMode[mode].distinctSemanticBadCases = semanticCases[mode].size;
  return { cohort, source, runs: runs.size, distinctCases: cases.size, byMode };
}

export interface ProposerInput {
  readonly task: string;
  readonly files: Readonly<Record<string, string>>;
  readonly evidence: readonly string[];
}
/** Real proposer contract: no fixture arm, expected outcomes, or scripted proposals. */
export interface BlindedProposer {
  name: string;
  propose(input: ProposerInput): Promise<Proposal>;
}

/** Whitelist and copy fields at runtime; a Pick type alone does not remove labels. */
export function prepareProposerInput(input: Pick<Fixture, "task" | "files" | "evidence">): ProposerInput {
  const record = dataRecord(input);
  const files = dataRecord(record?.files);
  const evidence = dataArray(record?.evidence);
  if (!record || typeof record.task !== "string" || !files || !Object.values(files).every(v => typeof v === "string") ||
      !evidence || !evidence.every(v => typeof v === "string"))
    throw Error("Malformed proposer input.");
  return Object.freeze({ task: record.task,
    files: Object.freeze({ ...files }) as Readonly<Record<string, string>>,
    evidence: Object.freeze(evidence) as readonly string[] });
}
