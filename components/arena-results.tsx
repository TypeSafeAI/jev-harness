import { useEffect, useState } from "react";
import { DetailPanel } from "./detail-panel";
import { DEMO_CATALOG } from "../examples/routing/scenarios";
import type { CliPhase, CliResult } from "../examples/host/codex";
import type { RouterMeasurement } from "../examples/routing/live-client";
import type { RoutingReceipt } from "../src/routing";

export interface LaneProgress { phase: CliPhase; startedAt: number; tools?: string[] }
export interface ArenaLane { tools: string[]; result: CliResult }
const phaseLabels = { starting: "Starting Codex…", working: "Agent is working…", calling: "Calling a fixture tool…", answering: "Preparing its answer…", failed: "Run incomplete" };
const names: Record<string, string> = { read_file: "Read file", propose_patch: "Record proposal", inspect_agent: "Inspect fixture" };
const number = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const seconds = (value: number) => `${(value / 1000).toFixed(1)} s`;

function AnswerText({ text }: { text: string }) {
  return <>{text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}

function LaneAnswer({ text }: { text: string }) {
  const long = text.length > 650 || text.split("\n").length > 8;
  const excerpt = text.slice(0, 600).split("\n").slice(0, 8).join("\n");
  const boundary = excerpt.lastIndexOf(" ");
  const visible = long ? `${excerpt.slice(0, boundary > 450 ? boundary : 600)}…` : text;
  return <>
    <div className="answer-heading"><h3>Agent answer</h3>{long && <span>Preview</span>}</div>
    <div className="arena-answer">{visible.split(/\n\s*\n/).map((paragraph, index) => <p key={index}><AnswerText text={paragraph} /></p>)}</div>
    {long && <DetailPanel title="Agent answer" trigger="Read full answer" triggerClass="answer-toggle"><div className="arena-answer">{text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}><AnswerText text={paragraph} /></p>)}</div></DetailPanel>}
  </>;
}

function outcome(lane: ArenaLane) {
  if (lane.result.status !== "completed") return lane.result.status === "cancelled" ? "Run cancelled" : "Run incomplete";
  if (lane.result.toolCallCount === 0) return "No fixture call observed";
  const returned = lane.result.toolCalls.filter(call => call.status === "returned").length;
  if (lane.result.traceTruncated) return `${number(lane.result.toolCallCount)} calls observed`;
  return returned === lane.result.toolCallCount ? `${returned} fixture ${returned === 1 ? "call returned" : "calls returned"}` : "Some fixture calls were rejected";
}

function activitySummary(lane: ArenaLane | undefined, running: boolean) {
  if (!lane) return running ? "Waiting for trace" : "Trace unavailable";
  if (lane.result.toolCallCount === 0) return "No fixture calls";
  const tools = [...new Set(lane.result.toolCalls.map(call => names[call.tool] ?? call.tool))];
  return `${tools.join(" · ")}${lane.result.traceTruncated ? " · partial trace" : ""}`;
}

export function ArenaResults({ lanes, receipt, jevUsage, pending, progress, finished = false }: {
  lanes: Partial<Record<"baseline" | "integrated", ArenaLane>>; receipt: RoutingReceipt | null; jevUsage: RouterMeasurement | null; pending: boolean; progress: Partial<Record<"baseline" | "integrated", LaneProgress>>; finished?: boolean;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => { if (!pending) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [pending]);
  const base = lanes.baseline, integrated = lanes.integrated;
  const integratedTools = integrated?.tools ?? progress.integrated?.tools;
  const hasPrerequisites = receipt && integratedTools?.some(id => !receipt.selectedIds.includes(id));
  const ready = base?.result.status === "completed" && integrated?.result.status === "completed";
  const integratedInput = integrated?.result.inputTokens != null && jevUsage?.inputTokens != null ? integrated.result.inputTokens + jevUsage.inputTokens : null;
  const baseInput = base?.result.inputTokens ?? null;
  const delta = ready && baseInput != null && integratedInput != null ? integratedInput - baseInput : null;
  const integratedTime = integrated && jevUsage ? integrated.result.durationMs + jevUsage.latencyMs : null;
  const timeDelta = ready && integratedTime != null ? integratedTime - base.result.durationMs : null;
  return <>
    <section className="arena-overview" aria-label="Comparison at a glance">
      <div><p className="eyebrow">The difference, at a glance</p><h2>{integratedTools ? `${base?.tools.length ?? DEMO_CATALOG.length} tools → ${integratedTools.length} exposed with Jev` : receipt ? `${receipt.selectedIds.length} selected · ${pending ? "preparing tool access" : "tool access not reported"}` : finished ? "No routing result returned" : "Same task. A smaller tool menu?"}</h2><p className="hint">{receipt ? "Compare the answers, then expand tool activity to see what each agent used." : "Run a comparison to see what Jev selects and what each agent actually does."}</p></div>
      <div className="arena-verdict"><span>Observed input · CLI + router</span><strong>{delta == null ? ready ? "Usage incomplete" : pending ? "Comparing…" : base || integrated || finished ? "Comparison incomplete" : "Awaiting results" : delta === 0 ? "Same input count" : `${number(Math.abs(delta))} ${delta < 0 ? "fewer" : "more"} tokens`}</strong>
        {timeDelta != null && <p className="arena-time-delta">{timeDelta === 0 ? "Same measured duration" : `${seconds(Math.abs(timeDelta))} ${timeDelta < 0 ? "less" : "longer"} with Jev`} · includes routing</p>}
        <p className="hint">{ready ? "This run only. Input includes Jev; output and cache details are in the inspector. Answer quality is not scored." : "Results appear as each lane finishes. A finished CLI run does not prove a tool was used."}</p>
      </div>
    </section>
    <div className="arena-lanes">
      {([['baseline', 'Without Jev', 'Codex CLI'], ['integrated', 'With Jev', 'Codex CLI + Jev Harness']] as const).map(([id, title, subtitle]) => {
        const lane = lanes[id], activity = progress[id];
        const running = pending && !lane && activity?.phase !== "failed";
        const phase = lane ? outcome(lane) : running ? activity ? phaseLabels[activity.phase] : "Waiting for Jev routing…" : activity ? "Run stopped · results incomplete" : finished ? "No result returned" : "Ready";
        const selected = lane?.tools ?? activity?.tools ?? (id === "baseline" ? DEMO_CATALOG.map(tool => tool.id) : undefined);
        const input = id === "baseline" ? baseInput : integratedInput;
        const duration = id === "baseline" ? lane?.result.durationMs ?? null : integratedTime;
        const waiting = running ? "Pending" : "Unknown";
        const answer = lane?.result.answer || lane?.result.error || "No final answer returned.";
        return <section className={`result arena-lane ${id}`} key={id} aria-label={title}>
          <div className="result-heading"><div><p className="eyebrow">{title}</p><h2>{subtitle}</h2></div><span className="lane-status" role="status">{running && <span className="activity-dot" aria-hidden="true" />}{phase}{running && activity && <small aria-hidden="true">{Math.max(0, Math.floor((now - activity.startedAt) / 1000))} s elapsed</small>}</span></div>
          <dl className="lane-metrics">
            <div><dt>Available tools</dt><dd><strong>{selected ? selected.length : pending ? "Pending" : "—"}</strong><small>{id === "baseline" ? "Full fixture catalog" : selected ? !receipt ? "Reported tool menu" : hasPrerequisites ? "Selected + prerequisites" : "Selected tools" : finished ? "Not reported" : "Awaiting tool access"}</small></dd></div>
            <div><dt>Input tokens</dt><dd><strong>{input != null ? number(input) : waiting}</strong><small>{id === "baseline" ? "CLI only" : lane ? `${number(lane.result.inputTokens)} CLI + ${number(jevUsage?.inputTokens)} Jev` : "CLI + Jev"}</small></dd></div>
            <div><dt>Time</dt><dd><strong>{duration != null ? seconds(duration) : waiting}</strong><small>{id === "baseline" ? "CLI only" : lane ? `${seconds(lane.result.durationMs)} CLI + ${jevUsage ? seconds(jevUsage.latencyMs) : "Unknown"} Jev` : "CLI + routing"}</small></dd></div>
          </dl>
          <div className="lane-answer">
            {lane ? <><LaneAnswer key={answer} text={answer} />{lane.result.error && lane.result.answer && <p className="lane-error">{lane.result.error}</p>}</> : <><h3>Agent answer</h3><p className="answer-placeholder">{running ? "The agent is running. Its answer appears here when ready." : activity || finished ? "No answer returned for this lane. Results are incomplete." : "Run a comparison to see the agent’s answer."}</p></>}
          </div>
          <div className="lane-activity">
            <DetailPanel title={`${title} · tool activity`} trigger={<><span>Tool activity</span><span className="activity-summary">{activitySummary(lane, running)}</span></>}>
            <div className="lane-activity-body">
              <div><h3>Available to the agent</h3><div className="context-strip">{selected?.map(tool => <span className="schema-chip" key={tool}>{names[tool] ?? tool}</span>)}{!selected && <span className="empty-context">{pending ? "Waiting for Jev routing…" : "No routing result available."}</span>}{selected?.length === 0 && <span className="empty-context">No tool exposed · inspect routing evidence</span>}</div></div>
              <div><h3>Calls observed by the host</h3>{lane ? lane.result.toolCallCount ? <div className="call-trace">{lane.result.toolCalls.slice(0, 6).map((call, index) => <span className="call-chip" key={index}>{names[call.tool] ?? call.tool}<small>{call.status}</small></span>)}{lane.result.toolCallCount > 6 && <span className="hint">+ {lane.result.toolCallCount - 6} more · full trace in the inspector</span>}</div> : <p className="hint">No fixture calls reached the host. Read the answer for context.</p> : <p className="hint">{running ? "Waiting for the host’s call trace. Agent activity is shown above." : "No trace available. The call count is unknown."}</p>}</div>
            </div>
            </DetailPanel>
          </div>
        </section>;
      })}
      <p className="arena-comparison-note">Time adds each lane’s CLI duration and its routing overhead; it is not the comparison’s wall-clock time. Lanes run in parallel after routing. Proposed patches are never applied.</p>
    </div>
  </>;
}

export function ArenaAccounting({ lanes, jevUsage }: { lanes: Partial<Record<"baseline" | "integrated", ArenaLane>>; jevUsage: RouterMeasurement | null }) {
  const base = lanes.baseline, integrated = lanes.integrated;
  const baseInput = base?.result.inputTokens ?? null;
  const integratedInput = integrated?.result.inputTokens != null && jevUsage?.inputTokens != null ? integrated.result.inputTokens + jevUsage.inputTokens : null;
  const scale = Math.max(baseInput ?? 0, integratedInput ?? 0, 1);
  if (!base && !integrated) return <p className="inspector-empty">Usage appears as the agents finish. Jev’s routing overhead is included in the comparison.</p>;
  return <><div className="accounting-chart" aria-label="Reported input tokens including router overhead">{([['Without Jev', baseInput, 0], ['With Jev', integratedInput, jevUsage?.inputTokens ?? 0]] as const).map(([label, total, router]) => <div className="accounting-row" key={label}><div><span>{label}</span><strong>{number(total)} tokens</strong></div><div className="token-track" aria-hidden="true">{total != null && <><span className="cli-bar" style={{ width: `${Math.max(0, total - router) / scale * 100}%` }} /><span className="router-bar" style={{ width: `${router / scale * 100}%` }} /></>}</div></div>)}<p className="hint chart-key"><span>CLI input</span><span>Jev input</span></p></div>
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
</>;
}
