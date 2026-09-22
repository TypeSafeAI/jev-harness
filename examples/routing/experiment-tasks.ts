/**
 * Synthetic task set for the N-tools-in-context vs Jev top-k experiment.
 *
 * Three tables are kept apart on purpose:
 *   EXPERIMENT_TASKS   what a proposer and the router may see (intent, synthetic files, catalog size)
 *   EXPERIMENT_LABELS  evaluation labels, joined only after a trial has finished
 *   EXPERIMENT_MOCKS / FAKE_PROPOSER_SCRIPT  scripted fake behaviour for offline runs
 * The runner never receives labels. Mock and fake values are demonstrations, not measurements.
 */
import { createCatalog, type RoutingReceipt, type ToolDefinition } from "../../src/routing/index.js";
import { DEMO_CATALOG, SCENARIOS } from "./scenarios.js";

const tool = (id: string, description: string, estimatedCostUnits: number, properties: Record<string, string>, required = Object.keys(properties)): ToolDefinition => ({
  id, kind: "tool", description, estimatedCostUnits,
  inputSchema: { type: "object", properties: Object.fromEntries(Object.entries(properties).map(([name, text]) => [name, { type: "string" as const, description: text }])), required, additionalProperties: false },
});

/** Synthetic descriptors with no fixture handler. A call is recorded and answered with an error; nothing runs. */
const SYNTHETIC_DESCRIPTORS: ToolDefinition[] = [
  tool("list_directory", "List the file names in one synthetic workspace directory without reading their contents.", 1, { directory: "Relative synthetic directory path." }),
  tool("search_text", "Find lines that contain a literal string across the synthetic workspace files.", 2, { query: "Literal text to find; not a regular expression." }),
  tool("draft_test_proposal", "Record a proposed unit-test file for a synthetic module; never write or run it.", 3, { path: "Relative synthetic path for the proposed test file.", content: "Proposed test source, recorded as pending only." }),
  tool("compare_files", "Describe the differences between two named synthetic files.", 2, { left: "First relative synthetic path.", right: "Second relative synthetic path." }),
  tool("todo_scan", "List TODO comments found in the synthetic workspace files.", 1, { directory: "Relative synthetic directory to scan." }),
  tool("rename_symbol_proposal", "Record a proposed rename of one identifier within a synthetic file; never apply it.", 3, { path: "Relative synthetic file path.", from: "Current identifier.", to: "Proposed identifier." }),
  tool("explain_error", "Explain a pasted synthetic error message without reading any files.", 2, { message: "The synthetic error text to explain." }),
  tool("format_proposal", "Record a formatting-only change proposal for a synthetic file; never apply it.", 2, { path: "Relative synthetic file path." }),
  tool("dependency_lookup", "Report the declared version of a package in a synthetic manifest.", 1, { name: "Package name to look up." }),
  tool("changelog_note", "Draft a one-paragraph changelog entry as text; nothing is published.", 1, { summary: "Short summary of the change to describe." }),
  tool("issue_draft", "Draft an issue description as text; nothing is filed anywhere.", 1, { title: "Proposed issue title.", body: "Proposed issue body." }),
  tool("translate_comment", "Translate one synthetic code comment into another natural language.", 1, { text: "Comment text to translate.", language: "Target language name." }),
  tool("file_stats", "Report the line and byte counts of one synthetic file.", 1, { path: "Relative synthetic file path." }),
  tool("lint_rule_lookup", "Report the configured value of one lint rule in a synthetic lint config.", 1, { rule: "Lint rule name." }),
  tool("license_lookup", "Report the license header of one synthetic file, if any.", 1, { path: "Relative synthetic file path." }),
  tool("api_signature_lookup", "Report the exported signature of one named function in a synthetic module.", 1, { path: "Relative synthetic module path.", name: "Exported function name." }),
  tool("complexity_estimate", "Estimate the cyclomatic complexity of one synthetic function.", 2, { path: "Relative synthetic file path.", name: "Function name." }),
];

export const EXPERIMENT_CATALOG = createCatalog([...DEMO_CATALOG, ...SYNTHETIC_DESCRIPTORS]);

export type SizeTier = "small" | "medium" | "large";
export const SIZE_TIERS: readonly SizeTier[] = ["small", "medium", "large"];
/** Permitted ids per catalog size. Small is the demo catalog, so arena results stay comparable. */
export const TIER_AVAILABLE_IDS: Readonly<Record<SizeTier, readonly string[]>> = Object.freeze({
  small: Object.freeze(DEMO_CATALOG.map(t => t.id)),
  medium: Object.freeze([...DEMO_CATALOG.map(t => t.id), "list_directory", "search_text", "draft_test_proposal", "compare_files", "todo_scan"]),
  large: Object.freeze(EXPERIMENT_CATALOG.map(t => t.id)),
});

const SUM_FILES = Object.freeze({
  "src/sum.ts": "export function sum(values: number[]) {\n  let total = 0;\n  for (let i = 0; i <= values.length; i++) total += values[i];\n  return total;\n}\nexport const mean = (values: number[]) => sum(values) / values.length;\n",
});
const CONFIG_FILES = Object.freeze({
  "src/config.ts": "export const requestTimeoutMs = 3000;\nexport const idleTimeoutMs = 30000;\n",
  "src/client.ts": "import { requestTimeoutMs } from \"./config\";\nexport const clientOptions = { timeout: requestTimeoutMs };\n",
});

/** Base intents. The five non-failure routing scenarios are reused verbatim; two synthetic intents target non-demo descriptors. */
interface BaseTask { baseId: string; intent: string; files: Readonly<Record<string, string>>; tiers: readonly SizeTier[] }
const reused = SCENARIOS.filter(s => !s.failure).map((s): BaseTask => ({ baseId: s.id, intent: s.intent, files: SUM_FILES, tiers: SIZE_TIERS }));
const BASE_TASKS: readonly BaseTask[] = [
  ...reused,
  { baseId: "search", intent: "Find every line that mentions requestTimeoutMs across the synthetic workspace.", files: CONFIG_FILES, tiers: ["medium", "large"] },
  { baseId: "test_draft", intent: "Propose a unit test showing what sum returns for an empty array in synthetic src/sum.ts; do not run it.", files: SUM_FILES, tiers: ["medium", "large"] },
];

/** What a trial may show a proposer or router. No labels, mock values or expected outcomes. */
export interface ExperimentTask { id: string; baseId: string; size: SizeTier; intent: string; files: Readonly<Record<string, string>> }
export const EXPERIMENT_TASKS: readonly ExperimentTask[] = Object.freeze(BASE_TASKS.flatMap(base => base.tiers.map(size => Object.freeze({ id: `${base.baseId}-${size}`, baseId: base.baseId, size, intent: base.intent, files: base.files }))));

/** Evaluation labels, keyed by base intent. Reused scenario labels are copied from SCENARIOS, not restated. */
export interface ExperimentLabel { acceptableIds: readonly string[]; expectedOutcome: Extract<RoutingReceipt["outcome"], "selected" | "needs_clarification"> }
export const EXPERIMENT_LABELS: Readonly<Record<string, ExperimentLabel>> = Object.freeze({
  ...Object.fromEntries(SCENARIOS.filter(s => !s.failure).map(s => [s.id, Object.freeze({ acceptableIds: Object.freeze([...s.acceptableIds]), expectedOutcome: s.expectedOutcome as ExperimentLabel["expectedOutcome"] })])),
  search: Object.freeze({ acceptableIds: Object.freeze(["search_text"]), expectedOutcome: "selected" as const }),
  test_draft: Object.freeze({ acceptableIds: Object.freeze(["draft_test_proposal"]), expectedOutcome: "selected" as const }),
});

/** Scripted fake Jev distributions (offline only). Reused scenarios keep their existing mock weights. */
export interface ExperimentMock { weights: Readonly<Record<string, number>>; confidence: number }
export const EXPERIMENT_MOCKS: Readonly<Record<string, ExperimentMock>> = Object.freeze({
  ...Object.fromEntries(SCENARIOS.filter(s => !s.failure).map(s => [s.id, Object.freeze({ weights: Object.freeze({ ...s.weights }), confidence: s.confidence })])),
  search: Object.freeze({ weights: Object.freeze({ search_text: 0.78, read_file: 0.1, inspect_agent: 0.07, needs_clarification: 0.05 }), confidence: 0.85 }),
  test_draft: Object.freeze({ weights: Object.freeze({ draft_test_proposal: 0.55, propose_patch: 0.35, read_file: 0.05, needs_clarification: 0.05 }), confidence: 0.8 }),
});

/**
 * Scripted fake proposer (offline only). It calls the preferred tools that are exposed, in order.
 * `whenMissing: "ask"` makes it ask instead when any preferred tool is missing (a proposer that will
 * not patch without reading first); `"call_first_exposed"` makes it fall back to the first exposed
 * tool when no preferred tool is exposed. Demonstration values, never measurements.
 */
export interface FakeProposerScript { prefers: readonly string[]; whenMissing: "ask" | "call_first_exposed" }
export const FAKE_PROPOSER_SCRIPT: Readonly<Record<string, FakeProposerScript>> = Object.freeze({
  read: { prefers: ["read_file"], whenMissing: "call_first_exposed" },
  patch: { prefers: ["read_file", "propose_patch"], whenMissing: "ask" },
  inspect: { prefers: ["read_file"], whenMissing: "call_first_exposed" },
  ambiguous: { prefers: [], whenMissing: "ask" },
  uncertain: { prefers: ["read_file"], whenMissing: "call_first_exposed" },
  search: { prefers: ["read_file"], whenMissing: "call_first_exposed" },
  test_draft: { prefers: ["read_file", "propose_patch"], whenMissing: "ask" },
});
