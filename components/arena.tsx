"use client";
import { useEffect, useRef, useState } from "react";
import { ARENA_CASES } from "../examples/arena/cases";
import { createRun, type ArenaRun } from "../examples/arena/history";
import { KEY_STORAGE, readApiKey } from "../examples/routing/api-key";
import { recordUsage } from "../examples/routing/usage";
import type { RouterMeasurement } from "../examples/routing/live-client";
import type { RoutingReceipt } from "../src/routing";
import { ArenaInspector } from "./arena-inspector";
import { ArenaResults } from "./arena-results";
import type { ArenaLane, LaneProgress } from "./arena-results";
import { ArenaHistory, runTime } from "./arena-history";
import { ArenaExamples } from "./arena-examples";
import { DetailPanel } from "./detail-panel";
import { useArenaHistory } from "./use-arena-history";

export function Arena() {
  const [caseId, setCaseId] = useState<string>(ARENA_CASES[0].id), [pending, setPending] = useState(false), [status, setStatus] = useState("Ready to compare.");
  const [lanes, setLanes] = useState<Partial<Record<"baseline" | "integrated", ArenaLane>>>({}), [receipt, setReceipt] = useState<RoutingReceipt | null>(null);
  const [progress, setProgress] = useState<Partial<Record<"baseline" | "integrated", LaneProgress>>>({});
  const [jevUsage, setJevUsage] = useState<RouterMeasurement | null>(null);
  const [view, setView] = useState<"compare" | "history">("compare"), [selectedRun, setSelectedRun] = useState<ArenaRun | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const history = useArenaHistory();
  const active = useRef<AbortController | null>(null), generation = useRef(0), restored = useRef(false), visibleRunId = useRef<string | null>(null), mounted = useRef(true);
  const fixture = ARENA_CASES.find(item => item.id === caseId)!;
  function cancel(clear = false) {
    active.current?.abort(); generation.current++; setPending(false);
    setStatus("Cancelled. Usage for an interrupted request may be unknown.");
    if (clear) { visibleRunId.current = null; setLanes({}); setProgress({}); setReceipt(null); setJevUsage(null); setSelectedRun(null); setSaveError(null); }
  }
  useEffect(() => {
    mounted.current = true;
    const changed = () => { cancel(true); setStatus("Key changed. Start a new comparison when ready."); };
    const storage = (event: StorageEvent) => { if (event.key === KEY_STORAGE || event.key === null) changed(); };
    window.addEventListener("jev-key-change", changed); window.addEventListener("storage", storage);
    return () => { mounted.current = false; active.current?.abort(); generation.current++; window.removeEventListener("jev-key-change", changed); window.removeEventListener("storage", storage); };
  }, []);
  useEffect(() => {
    if (!history.ready || restored.current) return;
    restored.current = true;
    const latest = history.runs.find(run => ARENA_CASES.some(item => item.id === run.fixture.id));
    if (latest) { setCaseId(latest.fixture.id); setSelectedRun(latest); }
  }, [history.ready, history.runs]);
  function openRun(run: ArenaRun) { if (pending) return; visibleRunId.current = null; setCaseId(run.fixture.id); setSelectedRun(run); setView("compare"); document.getElementById("arena-tab-compare")?.focus(); }
  function navigate(key: string) {
    const target = key === "Home" ? "compare" : key === "End" ? "history" : key === "ArrowRight" || key === "ArrowLeft" ? view === "compare" ? "history" : "compare" : null;
    if (!target) return false; setView(target); document.getElementById(`arena-tab-${target}`)?.focus(); return true;
  }
  async function run() {
    cancel(true); setView("compare"); const token = generation.current, startedAt = new Date().toISOString(), id = crypto.randomUUID();
    const controller = new AbortController(); active.current = controller; visibleRunId.current = id;
    setPending(true); setStatus("Starting comparison…"); const key = readApiKey(); let usageRecorded = false, streamStarted = false, complete = false, cancelled = false;
    let capturedReceipt: RoutingReceipt | null = null, capturedUsage: RouterMeasurement | null = null;
    const capturedLanes: Partial<Record<"baseline" | "integrated", ArenaLane>> = {};
    let message = "The stream ended before completion. Results may be partial.";
    try {
      const response = await fetch("/api/arena", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-typesafe-api-key": key } : {}) }, body: JSON.stringify({ caseId }), signal: controller.signal });
      if (!response.ok) { const body = await response.json(); message = body.error ?? "Arena unavailable."; if (token === generation.current) setStatus(message); return; }
      streamStarted = true;
      if (!response.body) throw Error();
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "", finished = false;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 1_000_000) throw Error();
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
          if (event.type === "usage") { usageRecorded = true; const m = event.measurement; capturedUsage = m ?? null; if (event.attempted) recordUsage({ at: new Date().toISOString(), status: event.error ? "failed" : "success", input: m?.inputTokens ?? null, output: m?.outputTokens ?? null, latencyMs: m?.latencyMs ?? null, keySource: key ? "personal" : "host" }); }
          if (token !== generation.current) continue;
          if (event.type === "usage") setJevUsage(capturedUsage);
          if (event.type === "stage") setStatus(event.value);
          if (event.type === "routing") { capturedReceipt = event.receipt; setReceipt(event.receipt); }
          if (event.type === "lane") setProgress(value => ({ ...value, [event.lane]: { ...value[event.lane as "baseline" | "integrated"], phase: event.phase, startedAt: value[event.lane as "baseline" | "integrated"]?.startedAt ?? Date.now() } }));
          if (event.type === "result" && (event.lane === "baseline" || event.lane === "integrated")) { const laneId: "baseline" | "integrated" = event.lane; capturedLanes[laneId] = { result: event.result, tools: event.tools }; setLanes({ ...capturedLanes }); }
          if (event.type === "error") { message = event.value; setStatus(message); finished = true; }
          if (event.type === "done") { complete = capturedLanes.baseline?.result.status === "completed" && capturedLanes.integrated?.result.status === "completed"; message = "Comparison finished. Inspect each lane's outcome; one run is not a benchmark."; setStatus(message); finished = true; }
        }
      }
      if (!finished && token === generation.current) setStatus(message);
    } catch {
      cancelled = controller.signal.aborted;
      controller.abort(); // A parsing/buffer failure must also terminate the host request.
      if (!usageRecorded) { usageRecorded = true; recordUsage({ at: new Date().toISOString(), status: cancelled ? "cancelled" : "failed", input: null, output: null, latencyMs: null, keySource: key ? "personal" : "host" }); }
      message = cancelled ? "Cancelled. Usage may be incomplete." : "The arena connection failed. Results may be partial; retry explicitly.";
      if (token === generation.current) setStatus(message);
    } finally {
      if (streamStarted && !usageRecorded) recordUsage({ at: new Date().toISOString(), status: cancelled ? "cancelled" : "failed", input: null, output: null, latencyMs: null, keySource: key ? "personal" : "host" });
      // Snapshot this invocation, never whichever task the user selected while it settled.
      try {
        const snapshot = createRun({ id, startedAt, finishedAt: new Date().toISOString(), fixture, status: cancelled ? "cancelled" : complete ? "complete" : Object.keys(capturedLanes).length ? "partial" : "failed", message, lanes: capturedLanes, receipt: capturedReceipt, jevUsage: capturedUsage });
        await history.save(snapshot);
        if (visibleRunId.current === id && mounted.current) setSelectedRun(snapshot);
      } catch { if (mounted.current) setSaveError("This run could not be saved locally. Download the current result to keep its evidence."); }
      if (token === generation.current && mounted.current) { setPending(false); active.current = null; }
    }
  }
  const shownLanes = selectedRun?.lanes ?? lanes, shownReceipt = selectedRun ? selectedRun.receipt : receipt, shownUsage = selectedRun ? selectedRun.jevUsage : jevUsage, shownFixture = selectedRun?.fixture ?? fixture;
  const hasResults = pending || selectedRun !== null || receipt !== null || Object.keys(lanes).length > 0;
  function exportRun() {
    const data = selectedRun ?? { at: new Date().toISOString(), caseId, fixture, receipt, jevUsage, lanes };
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, executionSchedule: "parallel_after_routing", applied: false }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "agent-arena.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="arena-workspace" id="arena-workspace" tabIndex={-1}>
    <div className="arena-intro"><div><p className="eyebrow">A controlled comparison</p><h1>One task. Two tool menus<span>.</span></h1><p>Compare Codex with and without Jev routing. Keep the evidence and watch performance over time.</p></div><span className="local-label">Stored on this device</span></div>
    <div className="arena-workspace-tabs" role="tablist" aria-label="Agent arena views">{([['compare', 'Compare'], ['history', 'History']] as const).map(([id, label]) => <button key={id} id={`arena-tab-${id}`} role="tab" aria-selected={view === id} aria-controls={`arena-view-${id}`} tabIndex={view === id ? 0 : -1} onKeyDown={event => { if (navigate(event.key)) event.preventDefault(); }} onClick={() => setView(id)}>{label}{id === "history" && <span>{history.runs.length}</span>}{id === "compare" && pending && <span className="activity-dot" aria-hidden="true" />}</button>)}</div>
    <section className="arena-controls" aria-label="Comparison controls"><ArenaExamples selected={caseId} disabled={pending || !history.ready} counts={Object.fromEntries(ARENA_CASES.map(item => [item.id, history.runs.filter(run => run.fixture.id === item.id).length]))} onChange={id => { cancel(true); setCaseId(id); setStatus("Ready to compare."); }} /><div className="arena-task-preview"><div><span>{view === "compare" && selectedRun ? "Saved task" : "Task preview"}</span><p className="arena-task">{view === "compare" ? shownFixture.task : fixture.task}</p></div><div className="arena-run-actions"><button className="primary" disabled={pending || !history.ready} onClick={() => void run()}>{pending ? "Comparing…" : "Run comparison ↗"}</button>{pending && <button className="quiet" onClick={() => cancel()}>Cancel</button>}</div></div><div className="arena-control-bottom"><p role="status" id="arena-status" className={`arena-status ${pending ? "is-running" : ""}`}>{pending && <span className="activity-dot" aria-hidden="true" />}{selectedRun && !pending ? `${selectedRun.status === "complete" ? "Completed" : selectedRun.status === "cancelled" ? "Cancelled" : selectedRun.status === "failed" ? "Failed" : "Partial"} run · ${runTime(selectedRun.finishedAt)}` : status}</p><div className="arena-method"><DetailPanel title="How the comparison works" trigger="How the comparison works"><p>One TypeSafe routing request, then two parallel Codex CLI runs using your local sign-in. Without Jev sees all fixture tools; With Jev sees the selected subset. Both use the same synthetic task.</p><p>Read-only settings. Proposed patches are recorded, never applied. The inspector tool is deterministic. Independent model choices and cache effects can change results; no answer-quality score is inferred.</p></DetailPanel></div></div></section>
    <section id="arena-view-compare" role="tabpanel" aria-labelledby="arena-tab-compare" hidden={view !== "compare"} className="arena-compare-view">
      {(saveError || history.error) && <p className="cache-error" role="status">{saveError || history.error}</p>}
      {selectedRun && <div className="saved-run-banner"><span>{history.runs.some(run => run.id === selectedRun.id) ? "Viewing saved evidence" : "Viewing unsaved evidence"} · {runTime(selectedRun.finishedAt)}<small>{history.runs.some(run => run.id === selectedRun.id) ? "Saved locally. Viewing this evidence uses no credits." : "Kept in this tab only. Download it before closing or starting another run."}</small>{selectedRun.status !== "complete" && <small className="saved-run-message">{selectedRun.message}</small>}</span><button className="quiet" onClick={() => setView("history")}>See history</button></div>}
      {hasResults ? <><ArenaResults lanes={shownLanes} receipt={shownReceipt} jevUsage={shownUsage} pending={pending} progress={progress} finished={selectedRun !== null} /><ArenaInspector lanes={shownLanes} receipt={shownReceipt} jevUsage={shownUsage} fixture={shownFixture} pending={pending} exportRun={exportRun} canExport={!pending} /></> : <div className="arena-welcome"><div><span className="welcome-lane">Without Jev</span><h2>The full tool catalog</h2><p>Codex gets every fixture tool.</p></div><span className="welcome-versus" aria-hidden="true">↔</span><div><span className="welcome-lane">With Jev</span><h2>A selected tool menu</h2><p>Jev routes first. Codex gets the selected tools.</p></div><p className="welcome-note">Run an example to compare the answers, calls, input tokens and timing. Each result is saved locally for your next visit.</p></div>}
    </section>
    <section id="arena-view-history" role="tabpanel" aria-labelledby="arena-tab-history" hidden={view !== "history"}><ArenaHistory runs={history.runs} fixture={fixture} selectedId={selectedRun?.id ?? null} pending={pending} error={history.error} onOpen={openRun} onClear={history.clear} onCompare={() => setView("compare")} /></section>
    <footer>Independent community experiment. Evidence, not authorization. No proposed code executes.</footer>
  </main>;
}
