import { DEMO_CATALOG } from "../examples/routing/scenarios";
import type { CliResult } from "../examples/host/codex";
import type { RouterMeasurement } from "../examples/routing/live-client";
import type { RoutingReceipt } from "../src/routing";
export interface ArenaLane { tools: string[]; result: CliResult }
const names: Record<string, string> = { read_file: "Read file", propose_patch: "Record proposal", inspect_agent: "Inspect fixture" };
const number = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const seconds = (value: number) => `${(value / 1000).toFixed(1)} s`;
function AnswerText({ text }: { text: string }) {
  return <>{text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}
function outcome(lane: ArenaLane) {
  if (lane.result.status !== "completed") return lane.result.status === "cancelled" ? "Run cancelled" : "Run incomplete";
  if (lane.result.toolCallCount === 0) return "No fixture call observed";
  const returned = lane.result.toolCalls.filter(call => call.status === "returned").length;
  if (lane.result.traceTruncated) return `${number(lane.result.toolCallCount)} calls observed`;
  return returned === lane.result.toolCallCount ? `${returned} fixture ${returned === 1 ? "call returned" : "calls returned"}` : "Some fixture calls were rejected";
}
export function ArenaResults({ lanes, receipt, jevUsage, pending }: {
  lanes: Partial<Record<"baseline" | "integrated", ArenaLane>>; receipt: RoutingReceipt | null; jevUsage: RouterMeasurement | null; pending: boolean;
}) {
  const base = lanes.baseline, integrated = lanes.integrated;
  const ready = base?.result.status === "completed" && integrated?.result.status === "completed";
  const integratedInput = integrated?.result.inputTokens != null && jevUsage?.inputTokens != null ? integrated.result.inputTokens + jevUsage.inputTokens : null;
  const baseInput = base?.result.inputTokens ?? null;
  const delta = ready && baseInput != null && integratedInput != null ? integratedInput - baseInput : null;
  const scale = Math.max(baseInput ?? 0, integratedInput ?? 0, 1);
  return <>
    <section className="arena-overview" aria-label="Comparison at a glance">
      <div><p className="eyebrow">The difference, at a glance</p><h2>{receipt ? `${base?.tools.length ?? DEMO_CATALOG.length} tools → ${receipt.selectedIds.length} exposed with Jev` : "Same task. A smaller tool menu?"}</h2><p className="hint">{receipt ? "Jev selects the tool menu before Codex starts. The lanes below show the calls that reached the fixture host and each agent’s answer." : "Run a comparison to see what Jev selects and what each agent actually does."}</p></div>
      <div className="arena-verdict"><span>Observed input · CLI + router</span><strong>{delta == null ? ready ? "Usage incomplete" : pending ? "Comparing…" : "Awaiting results" : delta === 0 ? "Same input count" : `${number(Math.abs(delta))} ${delta < 0 ? "fewer" : "more"} tokens`}</strong><p className="hint">{ready ? "This run only. Includes Jev input; output tokens and cache usage are shown below. Answer quality is not scored." : "Results appear as each lane finishes. A finished CLI run does not prove a tool was used."}</p></div>
    </section>
    {([['baseline', 'Without Jev', 'Codex CLI'], ['integrated', 'With Jev', 'Codex CLI + Jev Harness']] as const).map(([id, title, subtitle]) => {
      const lane = lanes[id], selected = lane?.tools ?? (id === "integrated" ? receipt?.selectedIds : undefined);
      return <section className={`result arena-lane ${id}`} key={id} aria-label={title}>
        <div className="result-heading"><div><p className="eyebrow">{title}</p><h2>{subtitle}</h2></div><span className="evidence-label">{lane ? outcome(lane) : pending ? "In progress" : "Ready"}</span></div>
        <ol className="arena-journey">
          <li><span className="journey-number" aria-hidden="true">1</span><div><h3>Tools the agent can see <span>{selected ? `${selected.length} exposed` : id === "baseline" ? "All fixture tools" : "Waiting for Jev"}</span></h3><div className="context-strip">{(selected ?? (id === "baseline" ? ["read_file", "propose_patch", "inspect_agent"] : [])).map(tool => <span className="schema-chip" key={tool}>{names[tool] ?? tool}</span>)}{selected?.length === 0 && <span className="empty-context">No tool exposed · inspect routing evidence</span>}</div></div></li>
          <li><span className="journey-number" aria-hidden="true">2</span><div><h3>What it actually called</h3>{lane ? lane.result.toolCallCount ? <div className="call-trace">{lane.result.toolCalls.slice(0, 6).map((call, index) => <span className="call-chip" key={index}>{names[call.tool] ?? call.tool}<small>{call.status}</small></span>)}{lane.result.toolCallCount > 6 && <span className="hint">+ {lane.result.toolCallCount - 6} more · full trace below</span>}</div> : <p className="hint">No fixture calls reached the host. Read the answer for context.</p> : <p className="hint">The observed trace will appear here.</p>}</div></li>
          <li><span className="journey-number" aria-hidden="true">3</span><div><h3>Agent answer</h3><div className="answer-card">{lane ? <><p className="arena-answer"><AnswerText text={lane.result.answer || lane.result.error || "No final answer returned."} /></p>{lane.result.error && lane.result.answer && <p className="hint">{lane.result.error}</p>}</> : <p className="hint">Awaiting this lane’s response.</p>}</div></div></li>
        </ol>
        {lane && <div className="lane-footnote"><span>{seconds(lane.result.durationMs)} CLI time</span><span>{number(lane.result.inputTokens)} CLI input tokens</span></div>}
      </section>;
    })}
    {(base || integrated) && <details className="arena-accounting"><summary>Compare tokens, timing and tool traces<span className="summary-meta">Including routing overhead</span></summary>
      <div className="accounting-chart" aria-label="Reported input tokens including router overhead">{([['Without Jev', baseInput, 0], ['With Jev', integratedInput, jevUsage?.inputTokens ?? 0]] as const).map(([label, total, router]) => <div className="accounting-row" key={label}><div><span>{label}</span><strong>{number(total)} tokens</strong></div><div className="token-track" aria-hidden="true">{total != null && <><span className="cli-bar" style={{ width: `${Math.max(0, total - router) / scale * 100}%` }} /><span className="router-bar" style={{ width: `${router / scale * 100}%` }} /></>}</div></div>)}<p className="hint chart-key"><span>CLI input</span><span>Jev input</span></p></div>
      <div className="table-scroll"><table><caption>Reported usage, not a price or quality benchmark. Unknown means unreported.</caption><thead><tr><th>Measure</th><th>Without Jev</th><th>With Jev</th></tr></thead><tbody>
        <tr><td>CLI input tokens</td><td>{number(base?.result.inputTokens)}</td><td>{number(integrated?.result.inputTokens)}</td></tr>
        <tr><td>Jev input tokens</td><td>Not called</td><td>{number(jevUsage?.inputTokens)}</td></tr>
        <tr><td>Total reported input tokens</td><td>{number(baseInput)}</td><td>{number(integratedInput)}</td></tr>
        <tr><td>Cached CLI input (included above)</td><td>{number(base?.result.cachedInputTokens)}</td><td>{number(integrated?.result.cachedInputTokens)}</td></tr>
        <tr><td>CLI output tokens</td><td>{number(base?.result.outputTokens)}</td><td>{number(integrated?.result.outputTokens)}</td></tr>
        <tr><td>Jev output tokens</td><td>Not called</td><td>{number(jevUsage?.outputTokens)}</td></tr>
        <tr><td>CLI duration</td><td>{base ? seconds(base.result.durationMs) : "Unknown"}</td><td>{integrated ? seconds(integrated.result.durationMs) : "Unknown"}</td></tr>
        <tr><td>Additional Jev duration</td><td>Not called</td><td>{jevUsage ? seconds(jevUsage.latencyMs) : "Unknown"}</td></tr>
      </tbody></table></div><p className="hint">Different providers, cache effects and independent model trajectories prevent a direct dollar comparison. A smaller tool menu may still use more tokens. Neither lane applies proposed patches.</p>
      {([['baseline', 'Without Jev'], ['integrated', 'With Jev']] as const).map(([id, label]) => lanes[id] && <details key={id}><summary>{label} · raw tool trace</summary><p className="hint">{lanes[id]!.result.traceTruncated ? "First 100 calls shown; the total includes all calls." : "Complete synthetic tool-call trace."}</p><pre>{JSON.stringify(lanes[id]!.result.toolCalls, null, 2)}</pre></details>)}
    </details>}
  </>;
}
