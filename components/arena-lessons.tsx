"use client";
import type { RunLessons } from "../examples/arena/lessons";
import { DetailPanel } from "./detail-panel";
const format = (n: number | null, unit: "tokens" | "time" | "count") => n === null ? "Unknown" : unit === "time" ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} s` : n.toLocaleString();
export function ArenaLessons({ report, onHistory }: { report: RunLessons; onHistory: () => void }) {
  const metrics = [
    { label: "Input tokens", unit: "tokens" as const, values: report.measurements.input },
    { label: "Measured time", unit: "time" as const, values: report.measurements.duration },
    { label: "Tools exposed", unit: "count" as const, values: report.measurements.tools },
    { label: "Calls observed", unit: "count" as const, values: report.measurements.calls },
  ];
  return <section className="arena-lessons" aria-label="Lessons learned">
    <DetailPanel title="Lessons from this run" trigger={<><span className="lesson-preview"><span className="eyebrow">Lessons learned</span><strong>{report.headline}</strong><small>Next: {report.recommendations[0]?.title}</small></span><span className="lesson-open">Review {report.recommendations.length} {report.recommendations.length === 1 ? "recommendation" : "recommendations"}</span></>}>
      <div className="lessons-content">
        <p className="lesson-source">From this run’s evidence · no additional API usage</p>
        <h3 className="lessons-headline">{report.headline}</h3>
        <details className="lesson-evidence"><summary>Compare reported measurements<span className="summary-meta">Input, time and tool activity</span></summary><div className="lesson-measurements">{metrics.map(({ label, unit, values }) => <div key={label}><h4>{label}</h4><dl><div><dt>Without Jev</dt><dd>{format(values.baseline, unit)}</dd></div><div><dt>With Jev</dt><dd>{format(values.integrated, unit)}</dd></div></dl>{values.delta !== null && unit !== "count" && <p>{values.delta === 0 ? "Same measured value" : `${format(Math.abs(values.delta), unit)}${unit === "tokens" ? " tokens" : ""} ${values.delta < 0 ? "less" : "more"} with Jev`}</p>}</div>)}</div>
        <p className="hint">With-Jev input and time include routing: {format(report.measurements.routerInput, "tokens")} input tokens and {format(report.measurements.routerDuration, "time")}. Time is measured work per lane, not the parallel comparison’s wall-clock time.{!report.comparable && " This run is incomplete; no paired performance conclusion is drawn."}</p></details>
        <div className="lesson-recommendations-heading"><h3>What to try next</h3><span>In priority order</span></div>
        <div className="lesson-recommendations">{report.recommendations.map((item, index) => <details key={item.id} className="lesson-recommendation" open={index === 0} data-lesson={item.id}>
          <summary><span className="lesson-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.scope}{index === 0 ? " · Start here" : ""}</small></span></summary>
          <div className="lesson-recommendation-body"><div><span>Observed</span><p>{item.evidence}</p></div><div><span>Try next</span><p>{item.next}</p></div><div><span>How to evaluate</span><p>{item.check}</p></div></div>
        </details>)}</div>
        <div className="lesson-footer"><p>{report.caveat} Host experiments describe changes to evaluate outside this fixed demo; nothing is applied automatically. Lessons are included in the comparison download.</p><button className="quiet" onClick={event => { event.currentTarget.closest("dialog")?.close(); onHistory(); }}>Compare repeated runs in History ↗</button></div>
      </div>
    </DetailPanel>
  </section>;
}
