/** Deliberately small JSON Schema subset; describes inputs, never a handler. */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, { type: "string" | "number" | "boolean"; description: string }>;
  required: string[];
  additionalProperties: false;
}
export interface ToolDefinition {
  id: string;
  kind: "tool" | "subagent";
  description: string;
  /** Host-supplied relative estimate, not dollars or measured provider usage. */
  estimatedCostUnits: number;
  inputSchema: ToolInputSchema;
}
export type Catalog = readonly ToolDefinition[];
export interface RoutingInput { intent: string; availableIds: readonly string[] }
export interface RoutingPolicy {
  topK: number;
  confidenceFloor: number;
  probabilityFloor: number;
  /** Only candidates this close to the best probability enter cost ranking. */
  relevanceWindow: number;
  /** Maximum estimated cost of each candidate, not a cumulative run budget. */
  maxCostUnits: number;
}
export interface RoutingRequest {
  model: "jev-1.13.0";
  questionSetVersion: 1;
  intent: string;
  untrustedDataNote: string;
  options: readonly { id: string; kind: "tool" | "subagent" | "fallback"; description: string }[];
}
/** Normalized choice evidence, not the provider's wire envelope. */
export interface RoutingEvidence {
  model: "jev-1.13.0";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface ToolRouter {
  source: "mock" | "jev";
  /** Hosts own transport, timeout, egress policy and response normalization. */
  review(request: RoutingRequest, signal?: AbortSignal): Promise<unknown>;
}
/** Separate from the unchanged proposal-review Receipt and ReviewVerdict. */
export interface RoutingReceipt {
  schemaVersion: 1;
  catalog: Catalog;
  request: RoutingRequest;
  policy: RoutingPolicy;
  source: "mock" | "jev";
  evidence: RoutingEvidence | null;
  outcome: "selected" | "needs_clarification" | "no_match" | "unavailable";
  selectedIds: readonly string[];
  reason: string;
  execution: { applied: false };
}
export type ContextMode = "lean" | "full";
export interface ContextState { loadedIds: readonly string[] }
