/** Bounded HTTP for the synthetic review experiment. Never imported by src/. */
import type { RunPayload } from "../../src/contract/payload.js";
import { JEV_MODEL, REVIEW_QUESTION_IDS, type JevTransport } from "../../src/contract/types.js";
import { MOCK_MODEL } from "../../src/benchmark/mock.js";
import { boundedText, JEV_SYSTEMONE_URL } from "./jev-choice.js";

export interface ReviewMeasurement {
  dispatched: boolean;
  httpStatus: number | null;
  responseBytes: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  failure: "http_error" | "malformed_response" | "cancelled" | "timeout" | "transport_error" | null;
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const tokenCount = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Retain only the fields the existing parser consumes, never arbitrary provider strings. */
export function reviewResponse(value: unknown) {
  const raw = record(value), answers = record(raw.answers), usage = record(raw.usage);
  return {
    model: raw.model === JEV_MODEL || raw.model === MOCK_MODEL ? raw.model : null,
    answers: Object.fromEntries(REVIEW_QUESTION_IDS.map(id => {
      const answer = record(answers[id]);
      return [id, { type: answer.type === "noul" ? "noul" : null, noul: typeof answer.noul === "number" && Number.isFinite(answer.noul) ? answer.noul : null }];
    })),
    usage: { input_tokens: tokenCount(usage.input_tokens), output_tokens: tokenCount(usage.output_tokens) },
  };
}

/** One request, no retries; credentials stay in the Authorization header. */
export function createReviewHttpTransport(options: { key: string; fetch?: typeof fetch; timeoutMs?: number }) {
  const upstreamFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw Error("Review timeout must be 1..120000 milliseconds.");
  const state: { measurement: ReviewMeasurement | null } = { measurement: null };
  const transport: JevTransport<RunPayload> = async (payload, signal) => {
    const started = performance.now();
    const measurement: ReviewMeasurement = { dispatched: false, httpStatus: null, responseBytes: null, inputTokens: null, outputTokens: null, latencyMs: 0, failure: null };
    state.measurement = measurement;
    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      requestSignal.throwIfAborted();
      measurement.dispatched = true;
      const result = await upstreamFetch(JEV_SYSTEMONE_URL, { method: "POST", headers: { Authorization: `Bearer ${options.key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: requestSignal, redirect: "error" });
      measurement.httpStatus = result.status;
      if (!result.ok) {
        measurement.failure = "http_error";
        await result.body?.cancel();
        throw Error();
      }
      let text: string;
      try { text = await boundedText(result.body, 64_000); }
      catch { measurement.failure = "malformed_response"; throw Error(); }
      measurement.responseBytes = Buffer.byteLength(text, "utf8");
      let raw: unknown;
      try { raw = JSON.parse(text); }
      catch { measurement.failure = "malformed_response"; throw Error(); }
      const normalized = reviewResponse(raw);
      measurement.inputTokens = normalized.usage.input_tokens;
      measurement.outputTokens = normalized.usage.output_tokens;
      requestSignal.throwIfAborted();
      return normalized;
    } catch {
      measurement.failure = signal?.aborted ? "cancelled" : timeout.aborted ? "timeout" : measurement.failure ?? "transport_error";
      throw Error("Review transport did not return a usable response.");
    } finally { measurement.latencyMs = Math.max(0, performance.now() - started); }
  };
  return { transport, state };
}
