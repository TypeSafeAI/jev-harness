import { type ContextMode, type ContextState } from "../../src/routing/index.js";
import { runDemo } from "./demo-state.js";
import { DEMO_CATALOG, SCENARIOS } from "./scenarios.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw Error(`Missing demo element: ${id}`);
  return found as T;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") {
  const item = document.createElement(tag);
  item.textContent = text;
  item.className = className;
  return item;
}
const task = element<HTMLTextAreaElement>("task");
const scenarioSelect = element<HTMLSelectElement>("scenario");
const chat = element("chat");
const button = element<HTMLButtonElement>("route-button");
const download = element<HTMLButtonElement>("download");
const budget = element<HTMLInputElement>("budget");
const topK = element<HTMLSelectElement>("top-k");
const checkboxes = new Map<string, HTMLInputElement>();
const badges = new Map<string, HTMLElement>();
const evidenceLabels = new Map<string, HTMLElement>();
const meters = new Map<string, HTMLMeterElement>();
let state: ContextState = { loadedIds: [] };
let current: Awaited<ReturnType<typeof runDemo>> | null = null;
let localComparisonMs = 0;
let generation = 0;

for (const scenario of SCENARIOS) {
  const option = node("option", scenario.title);
  option.value = scenario.id;
  scenarioSelect.append(option);
}
const customOption = node("option", "Custom task · asks for clarification");
customOption.value = "custom";
scenarioSelect.append(customOption);
for (const tool of DEMO_CATALOG) {
  const container = node("article", "", "tool");
  const line = node("div", "", "tool-line");
  const checkbox = node("input");
  checkbox.type = "checkbox";
  checkbox.id = `available-${tool.id}`;
  checkbox.checked = true;
  const label = node("label", tool.id);
  label.htmlFor = checkbox.id;
  line.append(checkbox, label);
  const description = node("p", tool.description, "hint");
  const meta = node("div", "", "tool-meta");
  const badge = node("span", "Available", "badge");
  meta.append(node("span", `${tool.kind} · ${tool.estimatedCostUnits} cost ${tool.estimatedCostUnits === 1 ? "unit" : "units"}`), badge);
  const evidenceLabel = node("p", "Awaiting evidence", "tool-evidence");
  const meter = node("meter");
  meter.min = 0;
  meter.max = 1;
  meter.value = 0;
  meter.setAttribute("aria-label", `${tool.id} scripted probability`);
  container.append(line, description, meta);
  const evidenceRow = node("div", "", "evidence-row");
  const evidenceHeading = node("div", "", "evidence-heading");
  evidenceHeading.append(node("span", tool.id), evidenceLabel);
  evidenceRow.append(evidenceHeading, meter);
  element("evidence-tools").append(evidenceRow);
  evidenceLabels.set(tool.id, evidenceLabel);
  meters.set(tool.id, meter);
  element("tools").append(container);
  checkboxes.set(tool.id, checkbox);
  badges.set(tool.id, badge);
  checkbox.addEventListener("change", () => { void update(false); });
}
function message(label: string, text: string, user = false) {
  const item = node("div", "", `message${user ? " user" : ""}`);
  item.append(node("strong", label), node("span", text));
  chat.append(item);
  // The demo keeps a small display history only; prior turns never enter routing.
  while (chat.children.length > 8) chat.firstElementChild?.remove();
  chat.scrollTop = chat.scrollHeight;
}
const yesNo = (value: boolean | null) => value === null ? "Not applicable" : value ? "Yes" : "No";
function row(label: string, full: string | number, lean: string | number) {
  const tr = node("tr");
  const heading = node("th", label);
  heading.scope = "row";
  tr.append(heading, node("td", String(full)), node("td", String(lean)));
  return tr;
}
function render(result: NonNullable<typeof current>) {
  const { comparison, context } = result;
  const { receipt, metrics } = comparison;
  const selectionLabel = receipt.outcome === "selected" ? receipt.selectedIds.join(" + ") : receipt.outcome === "needs_clarification" ? "Clarify the task" : receipt.outcome === "no_match" ? "No eligible tool" : "Evidence unavailable";
  element("flow-available").textContent = `${receipt.request.options.length - 1} available`;
  element("flow-selection").textContent = selectionLabel;
  element("flow-reason").textContent = receipt.outcome === "selected"
    ? `${metrics.selectedEstimatedCostUnits} estimated cost ${metrics.selectedEstimatedCostUnits === 1 ? "unit" : "units"} · lowest cost among eligible tools.`
    : receipt.outcome === "needs_clarification" ? (comparison.scenarioId === "custom" ? "No scripted answer for this task. Choose a sample to see routing." : "Ask a more specific question before choosing a tool.")
    : receipt.outcome === "no_match" ? "Check availability and the per-tool cost limit."
    : "No usable routing evidence. Lean context stays empty.";
  element("flow-loaded").textContent = `${context.state.loadedIds.length} ${context.state.loadedIds.length === 1 ? "schema" : "schemas"}`;
  element("flow-mode").textContent = context.mode === "lean" ? "Lean mode · selected tool schemas only." : "Batteries included · all available schemas.";
  for (const tool of DEMO_CATALOG) {
    const badge = badges.get(tool.id)!;
    const enabled = checkboxes.get(tool.id)!.checked;
    const selected = receipt.selectedIds.includes(tool.id);
    badge.textContent = !enabled ? "Unavailable" : selected ? "Selected" : "Available";
    badge.className = `badge${selected ? " selected" : ""}`;
    const probability = receipt.evidence?.probabilities[tool.id];
    evidenceLabels.get(tool.id)!.textContent = !enabled ? "Excluded from this request" : probability === undefined ? "No usable evidence" : `${Math.round(probability * 100)}% scripted probability`;
    meters.get(tool.id)!.value = probability ?? 0;
    badge.closest("article")!.classList.toggle("tool-selected", selected);
    badge.closest("article")!.classList.toggle("tool-unavailable", !enabled);
  }
  element("context-strip").replaceChildren(...context.state.loadedIds.map(id => node("span", id, "schema-chip")));
  if (!context.state.loadedIds.length) element("context-strip").append(node("span", "No schemas loaded", "empty-context"));
  const confidence = receipt.evidence === null ? "" : ` Choice confidence: ${Math.round(receipt.evidence.confidence * 100)}% (scripted).`;
  element("decision").textContent = receipt.reason + confidence;
  element("transition").textContent = `Loaded: ${context.state.loadedIds.join(", ") || "none"}. Added: ${context.addedIds.join(", ") || "none"}. Evicted: ${context.evictedIds.join(", ") || "none"}.`;
  element("full-bytes").textContent = metrics.fullContextBytes.toLocaleString();
  element("lean-bytes").textContent = metrics.leanContextBytes.toLocaleString();
  element("reduction").textContent = `${Math.round(metrics.contextReductionFraction * 100)}%`;
  const baseline = metrics.fullContextEstimatedTokens;
  const routed = metrics.leanTotalEstimatedInputTokens;
  const difference = baseline - routed;
  element("comparison-takeaway").textContent = receipt.outcome !== "selected" ? "No tool was selected. There is no equivalent completed task to compare." : difference === 0 ? "Routing uses the same estimated input." : `Routing uses ${Math.abs(difference)} ${difference > 0 ? "fewer" : "more"} estimated input tokens (${Math.round(Math.abs(difference) / baseline * 100)}%).`;
  element("baseline-tokens").textContent = baseline.toLocaleString();
  element("routed-tokens").textContent = routed.toLocaleString();
  element("baseline-explanation").textContent = `${comparison.full.state.loadedIds.length} available tool schemas + the task. No routing request.`;
  element("routed-explanation").textContent = `${metrics.leanContextEstimatedTokens} for the task and ${comparison.lean.state.loadedIds.length} selected ${comparison.lean.state.loadedIds.length === 1 ? "schema" : "schemas"} + ${routed - metrics.leanContextEstimatedTokens} for routing.`;
  for (const [id, value] of [["baseline-meter", baseline], ["routed-meter", routed]] as const) {
    const meter = element<HTMLMeterElement>(id);
    meter.max = Math.max(baseline, routed, 1);
    meter.value = value;
  }
  element("output-overhead").textContent = metrics.routerResponseEstimatedTokens === null
    ? "Routing output is unavailable; total usage cannot be compared."
    : `Routing also adds approximately ${metrics.routerResponseEstimatedTokens} output tokens, separate from the input above.`;
  element("comparison").replaceChildren(
    row("Context tokens (estimate)", metrics.fullContextEstimatedTokens, metrics.leanContextEstimatedTokens),
    row("Router request bytes", 0, metrics.routerRequestBytes),
    row("Total input tokens (estimate)", metrics.fullContextEstimatedTokens, metrics.leanTotalEstimatedInputTokens),
    row("Router output tokens (estimate)", "Not called", metrics.routerResponseEstimatedTokens ?? "Unavailable"),
    row("Acceptable tool included", yesNo(metrics.fullAcceptableToolIncluded), yesNo(metrics.leanAcceptableToolIncluded)),
    row("Cheapest acceptable selected", "No selection", yesNo(metrics.cheapestAcceptableSelected)),
  );
  element("timing").textContent = `Local comparison: ${localComparisonMs.toFixed(2)} ms. Includes both context assemblies; excludes rendering. No execution time is measured.`;
  element("schemas").textContent = JSON.stringify(context.tools, null, 2);
  element("receipt").textContent = JSON.stringify(receipt, null, 2);
  download.disabled = false;
}
function invalidate() {
  const staleMessage = "Task or policy changed. No current selection; route this task to refresh.";
  if (element("status").textContent !== staleMessage) element("status").textContent = staleMessage;
  generation++;
  current = null;
  download.disabled = true;
  button.disabled = false;
  element("decision").textContent = "Task or policy changed. Route this task to refresh the comparison.";
  element("transition").textContent = "Previous comparison cleared; no current selection.";
  element("context-strip").replaceChildren();
  element("comparison").replaceChildren();
  const availableCount = [...checkboxes.values()].filter(box => box.checked).length;
  element("flow-available").textContent = `${availableCount} available`;
  element("flow-selection").textContent = "Ready to route";
  element("flow-reason").textContent = "Run the edited task to produce fresh evidence.";
  element("flow-loaded").textContent = "No current result";
  element("flow-mode").textContent = "The previous comparison has been cleared.";
  for (const [id, meter] of meters) { meter.value = 0; evidenceLabels.get(id)!.textContent = "Awaiting evidence"; }
  for (const id of ["full-bytes", "lean-bytes", "reduction", "baseline-tokens", "routed-tokens"]) element(id).textContent = "—";
  for (const id of ["schemas", "receipt", "timing", "comparison-takeaway", "baseline-explanation", "routed-explanation", "output-overhead"]) element(id).textContent = "";
  for (const id of ["baseline-meter", "routed-meter"]) element<HTMLMeterElement>(id).value = 0;
  for (const [id, badge] of badges) { badge.textContent = checkboxes.get(id)!.checked ? "Available" : "Unavailable"; badge.className = "badge"; badge.closest("article")!.classList.remove("tool-selected"); badge.closest("article")!.classList.toggle("tool-unavailable", !checkboxes.get(id)!.checked); }
}
async function update(addTurn: boolean) {
  const thisGeneration = ++generation;
  task.setCustomValidity(task.value.trim() ? "" : "Enter a task to route.");
  if (!task.reportValidity()) { invalidate(); return; }
  if (!budget.checkValidity()) {
    element<HTMLDetailsElement>("settings").open = true;
    budget.reportValidity();
    invalidate();
    return;
  }
  button.disabled = true;
  download.disabled = true;
  const intent = task.value.trim();
  try {
    const start = performance.now();
    const result = await runDemo({ intent, availableIds: [...checkboxes].filter(([, box]) => box.checked).map(([id]) => id),
      mode: document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as ContextMode,
      topK: Number(topK.value), maxCostUnits: Number(budget.value) }, state);
    if (thisGeneration !== generation) return;
    localComparisonMs = performance.now() - start;
    current = result;
    state = result.context.state;
    render(result);
    const receipt = result.comparison.receipt;
    const label = receipt.outcome === "selected" ? `Selected ${receipt.selectedIds.join(", ")}` : receipt.outcome.replaceAll("_", " ");
    if (addTurn) {
      message("You · synthetic task", intent, true);
      const customNote = result.comparison.scenarioId === "custom" ? "This offline demo has no scripted answer for that task. Try a sample scenario. " : "";
      message(`Router · ${label}`, customNote + receipt.reason);
    }
    element("status").textContent = `${label}. ${result.context.state.loadedIds.length} schemas loaded. Nothing executed.`;
  } catch (error) {
    if (thisGeneration !== generation) return;
    invalidate();
    element("status").textContent = "Could not compare this task. Check the task and policy fields.";
    message("Check the task", error instanceof Error ? error.message : "The comparison was unavailable.");
  } finally { if (thisGeneration === generation) button.disabled = false; }
}
element<HTMLFormElement>("task-form").addEventListener("submit", event => { event.preventDefault(); void update(true); });
scenarioSelect.addEventListener("change", () => {
  const scenario = SCENARIOS.find(item => item.id === scenarioSelect.value);
  task.value = scenario?.intent ?? "";
  task.setCustomValidity("");
  if (scenario) void update(true);
  else { invalidate(); task.focus(); }
});
task.addEventListener("input", () => {
  task.setCustomValidity("");
  scenarioSelect.value = SCENARIOS.find(item => item.intent === task.value.trim())?.id ?? "custom";
  // Invalidate pending receipts as soon as the visible task changes.
  invalidate();
});
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) radio.addEventListener("change", () => { void update(false); });
topK.addEventListener("change", () => { void update(false); });
budget.addEventListener("input", invalidate);
budget.addEventListener("change", () => { void update(false); });
download.addEventListener("click", () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), source: "mock", localComparisonMs, ...current }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = node("a");
  anchor.href = url;
  anchor.download = "routing-receipt.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
task.value = SCENARIOS[0]!.intent;
void update(true);
