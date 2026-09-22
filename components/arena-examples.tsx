import { ARENA_CASES } from "../examples/arena/cases";
const descriptions: Record<string, { kind: string; detail: string }> = {
  read: { kind: "Understand", detail: "Read a module and explain its output." },
  patch: { kind: "Propose", detail: "Record a fix without changing files." },
  inspect: { kind: "Investigate", detail: "Find the relevant timeout setting." },
  ambiguous: { kind: "Clarify", detail: "See what happens when the task is vague." },
};
export function ArenaExamples({ selected, disabled, counts, onChange }: { selected: string; disabled: boolean; counts: Record<string, number>; onChange: (id: string) => void }) {
  return <fieldset className="arena-examples" disabled={disabled}><legend>Choose an example</legend><div className="example-options">{ARENA_CASES.map(item => <label className="example-option" key={item.id}><input type="radio" name="arena-example" value={item.id} checked={selected === item.id} onChange={() => onChange(item.id)} aria-labelledby={`example-title-${item.id}`} aria-describedby={`example-detail-${item.id}`} /><span className="example-kind">{descriptions[item.id]!.kind}</span><strong id={`example-title-${item.id}`}>{item.title}</strong><span className="example-detail" id={`example-detail-${item.id}`}>{descriptions[item.id]!.detail}</span><span className="example-history">{counts[item.id] ? `${counts[item.id]} saved ${counts[item.id] === 1 ? "run" : "runs"}` : "No saved runs yet"}</span></label>)}</div></fieldset>;
}
