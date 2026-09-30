/** Browser-safe host telemetry. No transport, policy or raw provider text. */
import { JEV_MODEL } from "../../src/contract/types.js";
import type { RoutingEvidence } from "../../src/routing/index.js";

export type RoutingRecovery = "none" | "probability_sum_only_v1";
export interface RoutingTransport { version: 1; recovery: RoutingRecovery; maxAttempts: 1 | 3; timeoutMs: number }
export function routingTransport(recovery: RoutingRecovery = "none", timeoutMs = 45_000): RoutingTransport {
  if (recovery !== "none" && recovery !== "probability_sum_only_v1" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) throw Error("Invalid routing transport configuration.");
  return { version: 1, recovery, maxAttempts: recovery === "none" ? 1 : 3, timeoutMs };
}
export interface RoutingDiagnostic {
  modelMatches: boolean; answerTypeMatches: boolean; confidenceValid: boolean;
  missingOptions: number; unexpectedOptions: number; probabilitySum: number | null;
  choiceInSet: boolean; leadingChoice: boolean;
}
export interface ChoiceProjection {
  modelMatches: boolean; answerTypeMatches: boolean; choice: string | null;
  confidence: number | null; probabilities: Record<string, number>;
}
export type JevAttemptStatus = "pending" | "valid" | "invalid_sum" | "invalid_other" | "http_error" | "transport_error" | "empty_body" | "body_limit" | "invalid_json" | "timeout" | "cancelled";
export interface JevAttempt {
  index: number; status: JevAttemptStatus; requestBytes: number; responseBytes: number | null;
  inputTokens: number | null; outputTokens: number | null; latencyMs: number | null;
  httpStatus: number | null; diagnostic: RoutingDiagnostic | null; projection: ChoiceProjection | null;
}
export interface JevAttemptLedger extends RoutingTransport {
  optionIds: string[]; complete: boolean; attempts: JevAttempt[]; returnedAttempt: number | null;
  stopReason: "valid" | "exhausted" | "failure" | "cancelled" | "timeout" | "local_limit" | null;
}
export interface RouterMeasurement {
  requestBytes: number; responseBytes: number | null; inputTokens: number | null; outputTokens: number | null;
  latencyMs: number | null; diagnostic?: RoutingDiagnostic; attemptLedger?: JevAttemptLedger;
}
export type JevMeasurement = RouterMeasurement;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export function attemptTotals(ledger: JevAttemptLedger) {
  const metric = (key: "inputTokens" | "outputTokens" | "responseBytes") => {
    const known = ledger.attempts.flatMap(a => a[key] === null ? [] : [a[key]]);
    return { total: ledger.complete && known.length === ledger.attempts.length ? sum(known) : null, reported: sum(known), unknown: ledger.attempts.length - known.length };
  };
  return { providerRequests: ledger.complete ? ledger.attempts.length : null, observedProviderRequests: ledger.attempts.length,
    requestBytes: sum(ledger.attempts.map(a => a.requestBytes)), input: metric("inputTokens"), output: metric("outputTokens"), response: metric("responseBytes"),
    retryLatencyMs: ledger.attempts.slice(1).every(a => a.latencyMs !== null) ? sum(ledger.attempts.slice(1).map(a => a.latencyMs!)) : null };
}
export function measureLedger(ledger: JevAttemptLedger, latencyMs: number | null): RouterMeasurement {
  const totals = attemptTotals(ledger), diagnostic = ledger.attempts.at(-1)?.diagnostic;
  return { requestBytes: totals.requestBytes, responseBytes: totals.response.total, inputTokens: totals.input.total, outputTokens: totals.output.total,
    latencyMs, ...(diagnostic ? { diagnostic: structuredClone(diagnostic) } : {}), attemptLedger: structuredClone(ledger) };
}
export function projectedEvidence(projection: ChoiceProjection): RoutingEvidence {
  return { model: JEV_MODEL, choice: projection.choice!, confidence: projection.confidence!, probabilities: { ...projection.probabilities } };
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v);
const unit = (v: unknown): v is number => finite(v) && v <= 1;
const nullableCount = (v: unknown) => v === null || count(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const keys = (v: Record<string, unknown>, expected: readonly string[]) => same(Object.keys(v).sort(), [...expected].sort());
const fail = (): never => { throw Error("Invalid routing measurement or attempt ledger."); };
export function parseRoutingTransport(raw: unknown): RoutingTransport {
  if (!record(raw) || !keys(raw, ["version", "recovery", "maxAttempts", "timeoutMs"]) || raw.version !== 1) return fail();
  const expected = routingTransport(raw.recovery as RoutingRecovery, raw.timeoutMs as number);
  if (raw.maxAttempts !== expected.maxAttempts) return fail();
  return expected;
}
function diagnostic(raw: unknown): RoutingDiagnostic {
  if (!record(raw) || !keys(raw, ["modelMatches", "answerTypeMatches", "confidenceValid", "missingOptions", "unexpectedOptions", "probabilitySum", "choiceInSet", "leadingChoice"]) ||
    ![raw.modelMatches, raw.answerTypeMatches, raw.confidenceValid, raw.choiceInSet, raw.leadingChoice].every(v => typeof v === "boolean") || !count(raw.missingOptions) || !count(raw.unexpectedOptions) || !(raw.probabilitySum === null || finite(raw.probabilitySum))) return fail();
  return raw as unknown as RoutingDiagnostic;
}
/** Strict new-format parser; old scalar measurements remain readable without invented attempts. */
export function parseMeasurement(raw: unknown, allowedIds?: readonly string[], evidence?: RoutingEvidence | null, allowSubset = false): RouterMeasurement {
  if (!record(raw) || !count(raw.requestBytes) || ![raw.responseBytes, raw.inputTokens, raw.outputTokens].every(nullableCount) || !(raw.latencyMs === null || finite(raw.latencyMs) && raw.latencyMs <= 86_400_000)) return fail();
  const clean: RouterMeasurement = { requestBytes: raw.requestBytes, responseBytes: raw.responseBytes as number | null, inputTokens: raw.inputTokens as number | null, outputTokens: raw.outputTokens as number | null, latencyMs: raw.latencyMs as number | null };
  if (raw.diagnostic !== undefined) clean.diagnostic = diagnostic(raw.diagnostic);
  if (raw.attemptLedger === undefined) return clean;
  if (!keys(raw, ["requestBytes", "responseBytes", "inputTokens", "outputTokens", "latencyMs", "attemptLedger", ...(raw.diagnostic === undefined ? [] : ["diagnostic"])])) return fail();
  const l = raw.attemptLedger;
  if (!record(l) || !keys(l, ["version", "recovery", "maxAttempts", "timeoutMs", "optionIds", "complete", "attempts", "returnedAttempt", "stopReason"])) return fail();
  const config = parseRoutingTransport({ version: l.version, recovery: l.recovery, maxAttempts: l.maxAttempts, timeoutMs: l.timeoutMs });
  if (!Array.isArray(l.optionIds) || l.optionIds.length < 1 || l.optionIds.length > 255 || new Set(l.optionIds).size !== l.optionIds.length || !l.optionIds.every(id => typeof id === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(id) && (!allowedIds || allowedIds.includes(id))) || typeof l.complete !== "boolean" || !Array.isArray(l.attempts) || l.attempts.length > config.maxAttempts) return fail();
  const ids = l.optionIds as string[];
  if (!ids.includes("needs_clarification")) return fail();
  if (allowedIds && !allowSubset && !same(ids, allowedIds)) return fail();
  const attempts = l.attempts.map((raw, index): JevAttempt => {
    if (!record(raw) || !keys(raw, ["index", "status", "requestBytes", "responseBytes", "inputTokens", "outputTokens", "latencyMs", "httpStatus", "diagnostic", "projection"]) || raw.index !== index + 1 || !["pending", "valid", "invalid_sum", "invalid_other", "http_error", "transport_error", "empty_body", "body_limit", "invalid_json", "timeout", "cancelled"].includes(String(raw.status)) || !count(raw.requestBytes) || raw.requestBytes === 0 || ![raw.responseBytes, raw.inputTokens, raw.outputTokens].every(nullableCount) || !(raw.latencyMs === null || finite(raw.latencyMs) && raw.latencyMs <= 86_400_000) || !(raw.httpStatus === null || count(raw.httpStatus) && raw.httpStatus >= 100 && raw.httpStatus <= 599)) return fail();
    if (index > 0 && (l.attempts as JevAttempt[])[index - 1]!.status !== "invalid_sum") return fail();
    if (raw.status === "pending" ? l.complete || index !== (l.attempts as unknown[]).length - 1 || raw.latencyMs !== null : raw.latencyMs === null) return fail();
    const d = raw.diagnostic === null ? null : diagnostic(raw.diagnostic);
    const p = raw.projection;
    if (["valid", "invalid_sum", "invalid_other"].includes(String(raw.status))) {
      if (!d || !record(p) || !keys(p, ["modelMatches", "answerTypeMatches", "choice", "confidence", "probabilities"]) || typeof p.modelMatches !== "boolean" || typeof p.answerTypeMatches !== "boolean" || !(p.choice === null || typeof p.choice === "string" && ids.includes(p.choice)) || !(p.confidence === null || unit(p.confidence)) || !record(p.probabilities) || !Object.entries(p.probabilities).every(([id, v]) => ids.includes(id) && unit(v)) || raw.httpStatus === null || Number(raw.httpStatus) < 200 || Number(raw.httpStatus) >= 300 || raw.responseBytes === null) return fail();
      const scores = p.probabilities;
      if (d.modelMatches !== p.modelMatches || d.answerTypeMatches !== p.answerTypeMatches || d.choiceInSet !== (p.choice !== null) || d.confidenceValid !== (p.confidence !== null) || d.missingOptions > ids.length - Object.keys(scores).length) return fail();
      const completeVector = ids.every(id => Object.hasOwn(scores, id)) && d.unexpectedOptions === 0;
      const shape = p.modelMatches && p.answerTypeMatches && p.choice !== null && p.confidence !== null && ids.every(id => Object.hasOwn(scores, id)) && d.missingOptions === 0 && d.unexpectedOptions === 0;
      const leading = p.choice !== null && scores[p.choice as string] === Math.max(...Object.values(scores) as number[]);
      if (completeVector && (d.probabilitySum !== sum(ids.map(id => scores[id] as number)) || d.leadingChoice !== leading)) return fail();
      const soleSum = shape && leading;
      const classified = soleSum ? Math.abs(sum(ids.map(id => scores[id] as number)) - 1) > 1e-6 ? "invalid_sum" : "valid" : "invalid_other";
      if (classified !== raw.status) return fail();
    } else if (d !== null || p !== null || raw.inputTokens !== null || raw.outputTokens !== null) return fail();
    const httpOk = raw.httpStatus !== null && Number(raw.httpStatus) >= 200 && Number(raw.httpStatus) < 300;
    if (["empty_body", "body_limit", "invalid_json"].includes(String(raw.status)) && !httpOk) return fail();
    if (raw.status === "invalid_json" && (raw.responseBytes === null || raw.responseBytes === 0)) return fail();
    if (raw.status === "empty_body" && raw.responseBytes !== null && raw.responseBytes !== 0) return fail();
    if (raw.responseBytes !== null && Number(raw.responseBytes) > 64_000) return fail();
    if (["pending", "http_error", "body_limit", "transport_error", "timeout", "cancelled"].includes(String(raw.status)) && raw.responseBytes !== null) return fail();
    if (raw.status === "pending" && raw.httpStatus !== null) return fail();
    if (raw.status === "http_error" && (raw.httpStatus === null || Number(raw.httpStatus) >= 200 && Number(raw.httpStatus) < 300)) return fail();
    return structuredClone(raw) as unknown as JevAttempt;
  });
  if (attempts.some(a => a.requestBytes !== attempts[0]!.requestBytes)) return fail();
  const last = attempts.at(-1);
  if (last?.status === "invalid_sum" && attempts.length === config.maxAttempts && (!l.complete || l.stopReason !== "exhausted")) return fail();
  if (l.complete) {
    if (raw.latencyMs === null || sum(attempts.map(a => a.latencyMs ?? 0)) > Number(raw.latencyMs) + .001) return fail();
    if (l.stopReason === "valid") { if (last?.status !== "valid" || l.returnedAttempt !== attempts.length) return fail(); }
    else {
      if (l.returnedAttempt !== null) return fail();
      if (l.stopReason === "exhausted" ? last?.status !== "invalid_sum" || attempts.length !== config.maxAttempts
        : l.stopReason === "failure" ? !last || !["invalid_other", "http_error", "transport_error", "empty_body", "body_limit", "invalid_json"].includes(last.status)
        : l.stopReason === "cancelled" || l.stopReason === "timeout" ? last !== undefined && last.status !== "invalid_sum" && last.status !== l.stopReason
        : l.stopReason === "local_limit" ? last !== undefined && last.status !== "invalid_sum" : true) return fail();
    }
  } else if (l.stopReason !== null || l.returnedAttempt !== null || raw.latencyMs !== null || attempts.some(a => a.status !== "invalid_sum" && a.status !== "pending")) return fail();
  const ledger = { ...config, optionIds: [...ids], complete: l.complete, attempts, returnedAttempt: l.returnedAttempt, stopReason: l.stopReason } as JevAttemptLedger;
  const expected = measureLedger(ledger, clean.latencyMs);
  for (const key of ["requestBytes", "responseBytes", "inputTokens", "outputTokens", "diagnostic"] as const) if (!same(clean[key], expected[key])) return fail();
  if (evidence !== undefined) {
    if (ledger.returnedAttempt === null ? evidence !== null : (evidence === null || !sameEvidence(evidence, projectedEvidence(last!.projection!)))) return fail();
  }
  return expected;
}
function sameEvidence(a: RoutingEvidence, b: RoutingEvidence) {
  return a.model === b.model && a.choice === b.choice && a.confidence === b.confidence && same(Object.entries(a.probabilities).sort(), Object.entries(b.probabilities).sort());
}
