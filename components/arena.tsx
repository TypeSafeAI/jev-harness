"use client";
import { useEffect, useRef, useState } from "react";
import { ARENA_CASES } from "../examples/arena/cases";
import { readApiKey } from "../examples/routing/api-key";
import { recordUsage } from "../examples/routing/usage";
import type { RouterMeasurement } from "../examples/routing/live-client";
import type { RoutingReceipt } from "../src/routing";
import { ArenaResults } from "./arena-results";
import type { ArenaLane } from "./arena-results";
export function Arena() {
  const [caseId, setCaseId] = useState<string>(ARENA_CASES[0].id), [pending, setPending] = useState(false), [status, setStatus] = useState("Ready to compare.");
  const [lanes, setLanes] = useState<Partial<Record<"baseline" | "integrated", ArenaLane>>>({}), [receipt, setReceipt] = useState<RoutingReceipt | null>(null);
  const [jevUsage, setJevUsage] = useState<RouterMeasurement | null>(null);
  const active = useRef<AbortController | null>(null), generation = useRef(0);
  const fixture = ARENA_CASES.find(item => item.id === caseId)!;
  function cancel(clear = false) { active.current?.abort(); generation.current++; setPending(false); setStatus("Cancelled. Usage for an interrupted request may be unknown."); if (clear) { setLanes({}); setReceipt(null); setJevUsage(null); } }
  useEffect(() => { const changed = () => cancel(true); window.addEventListener("jev-key-change", changed); window.addEventListener("storage", changed); return () => { active.current?.abort(); generation.current++; window.removeEventListener("jev-key-change", changed); window.removeEventListener("storage", changed); }; }, []);
  async function run() {
    cancel(true); const token = generation.current; const controller = new AbortController(); active.current = controller;
    setPending(true); setStatus("Starting comparison…"); const key = readApiKey(); let usageRecorded = false, streamStarted = false;
    try {
      const response = await fetch("/api/arena", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-typesafe-api-key": key } : {}) }, body: JSON.stringify({ caseId }), signal: controller.signal });
      if (!response.ok) { const body = await response.json(); setStatus(body.error ?? "Arena unavailable."); return; }
      streamStarted = true;
      if (!response.body) throw Error();
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "", finished = false;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 1_000_000) throw Error();
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
          if (event.type === "usage") { usageRecorded = true; const m = event.measurement; if (event.attempted) recordUsage({ at: new Date().toISOString(), status: event.error ? "failed" : "success", input: m?.inputTokens ?? null, output: m?.outputTokens ?? null, latencyMs: m?.latencyMs ?? null, keySource: key ? "personal" : "host" }); }
          if (token !== generation.current) continue;
          if (event.type === "usage") setJevUsage(event.measurement ?? null);
          if (event.type === "stage") setStatus(event.value);
          if (event.type === "routing") setReceipt(event.receipt);
          if (event.type === "result") setLanes(value => ({ ...value, [event.lane]: { result: event.result, tools: event.tools } }));
          if (event.type === "error") { setStatus(event.value); finished = true; }
          if (event.type === "done") { setStatus("Comparison finished. Inspect each lane's outcome; one run is not a benchmark."); finished = true; }
        }
      }
      if (!finished && token === generation.current) setStatus("The stream ended before completion. Results may be partial.");
    } catch {
      if (!usageRecorded) { usageRecorded = true; recordUsage({ at: new Date().toISOString(), status: controller.signal.aborted ? "cancelled" : "failed", input: null, output: null, latencyMs: null, keySource: key ? "personal" : "host" }); }
      if (token === generation.current) setStatus(controller.signal.aborted ? "Cancelled. Usage may be incomplete." : "The arena connection failed. Results may be partial; retry explicitly.");
    } finally {
      if (streamStarted && !usageRecorded) recordUsage({ at: new Date().toISOString(), status: controller.signal.aborted ? "cancelled" : "failed", input: null, output: null, latencyMs: null, keySource: key ? "personal" : "host" });
      if (token === generation.current) setPending(false);
    }
  }
  function exportRun() { const url = URL.createObjectURL(new Blob([JSON.stringify({ at: new Date().toISOString(), caseId, fixture, receipt, jevUsage, lanes, order: ["baseline", "integrated"], applied: false }, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "agent-arena.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <main><div className="intro"><h1>Agent arena<span>.</span></h1><p>One synthetic task. Codex CLI, with and without Jev choosing its tool context.</p></div><section className="composer lab-card arena-controls"><div className="scenario-row"><label htmlFor="task">Example</label><select id="task" value={caseId} disabled={pending} onChange={event => { cancel(true); setCaseId(event.target.value); setStatus("Ready to compare."); }}>{ARENA_CASES.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div><p className="arena-task">{fixture.task}</p><div className="compose-actions"><p>Uses your local Codex sign-in and a TypeSafe key. Two CLI runs plus one live routing request.</p><button className="primary" disabled={pending} onClick={() => void run()}>Run comparison ↗</button>{pending && <button className="quiet" onClick={() => cancel()}>Cancel</button>}</div><p role="status" id="arena-status" className="hint">{status}</p></section><section className="result"><p className="eyebrow">What changes</p><h2>Tool exposure, before the agent runs</h2><p className="result-reason">Without Jev, Codex sees every synthetic MCP tool. With Jev, the harness selects the schemas exposed by the MCP host. The trace shows whether the agent actually called those tools.</p><p className="hint">Fresh read-only CLI runs. Shell, browser, plugins and external tools are disabled. Fixture reads and proposal recording are real; proposed patches are never applied. The inspector tool is deterministic, not a second model agent.</p></section>
    <ArenaResults lanes={lanes} receipt={receipt} jevUsage={jevUsage} pending={pending} />
    <div className="inspection"><details><summary>Inspect the comparison setup</summary><p className="hint">Fixed order: baseline then integrated, each in a fresh temporary directory. Same task, fixture, CLI settings and default model. The only treatment is the MCP tool list. Cache effects and independent model trajectories can affect usage and timing. Task quality is not scored automatically. Other installed CLI versions may fail visibly.</p><pre>{JSON.stringify(fixture.files, null, 2)}</pre></details><details><summary>Inspect Jev routing evidence</summary><pre>{receipt ? JSON.stringify(receipt, null, 2) : "No routing receipt yet."}</pre></details><button className="quiet" disabled={!receipt || pending} onClick={exportRun}>Download comparison</button></div><footer>Independent community experiment. Evidence, not authorization. No proposed code executes.</footer></main>;
}
