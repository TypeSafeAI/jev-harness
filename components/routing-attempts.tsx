import { attemptTotals, type RouterMeasurement } from "../examples/routing/measurement";
const number = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const status = { pending: "In progress", valid: "Valid evidence", invalid_sum: "Invalid probability total", invalid_other: "Other invalid evidence", http_error: "HTTP failure", transport_error: "Transport failure", empty_body: "Empty response", body_limit: "Response too large", invalid_json: "Invalid JSON", timeout: "Deadline reached", cancelled: "Cancelled" };
const stops = { valid: "Valid evidence returned", exhausted: "Attempt limit reached", failure: "Request failed", cancelled: "Cancelled", timeout: "Deadline reached", local_limit: "Local request limit reached" };
const time = (value: number | null | undefined) => value == null ? "Unknown" : `${(value / 1000).toFixed(2)} s`;
/** Same whole-call ledger in the Arena inspector and tab usage history. */
export function RoutingAttempts({ measurement }: { measurement: RouterMeasurement | null | undefined }) {
  const ledger = measurement?.attemptLedger, totals = ledger ? attemptTotals(ledger) : null;
  return <div className="routing-attempts"><p className="hint">Logical routing calls: 1 · Physical requests: {number(totals?.providerRequests)}{totals?.providerRequests == null && totals && ` (${totals.observedProviderRequests} observed; lower bound)`} · Additional requests: {totals ? Math.max(0, totals.observedProviderRequests - 1) : "Unknown"}.</p>
    {ledger && totals ? <details><summary>Routing attempts · {ledger.stopReason ? stops[ledger.stopReason] : "In progress"}</summary>
      <p className="hint">{ledger.recovery === "none" ? "One request; recovery disabled" : "Retry invalid probability totals"} · cap {ledger.maxAttempts} · one {(ledger.timeoutMs / 1000).toFixed(0)} s deadline. Retry duration: {time(totals.retryLatencyMs)}. Reported subtotals: {number(totals.input.reported)} input ({totals.input.unknown} attempts unknown), {number(totals.output.reported)} output ({totals.output.unknown} attempts unknown). Whole-call totals stay unknown when any attempt is unreported.</p>
      <p className="hint">Every dispatched Jev request; diagnostics contain no provider text.</p>
      <ol className="routing-attempt-list" aria-label="Jev request attempts">{ledger.attempts.map(a => <li className="routing-attempt-card" key={a.index}>
        <div className="routing-attempt-heading"><strong>Attempt {a.index}</strong><span>{status[a.status]}{a.httpStatus !== null && ` · HTTP ${a.httpStatus}`}</span></div>
        <dl className="routing-attempt-metrics">
          <div><dt>Input tokens</dt><dd>{number(a.inputTokens)}</dd></div>
          <div><dt>Output tokens</dt><dd>{number(a.outputTokens)}</dd></div>
          <div><dt>Duration</dt><dd>{time(a.latencyMs)}</dd></div>
          <div><dt>Bytes sent</dt><dd>{number(a.requestBytes)}</dd></div>
          <div><dt>Bytes received</dt><dd>{number(a.responseBytes)}</dd></div>
        </dl>
        <p className="routing-attempt-diagnostic">{a.diagnostic ? <>Probability total: <span>{a.diagnostic.probabilitySum === null ? "Unknown" : String(a.diagnostic.probabilitySum)}</span>. Missing options: {a.diagnostic.missingOptions}. Unexpected options: {a.diagnostic.unexpectedOptions}. Leading choice: {a.diagnostic.leadingChoice ? "yes" : "no"}.</> : "Diagnostic unavailable."}</p>
      </li>)}</ol>
    </details> : <p className="hint">No attempt ledger was delivered. Scalar usage may be historical; physical request count is unknown.</p>}
  </div>;
}
