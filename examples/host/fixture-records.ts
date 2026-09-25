import type { ToolCall } from "./codex";
import { FIXTURE_ARGUMENT_CHARS, FIXTURE_HOST_REVISION, FIXTURE_PROPOSAL_BYTES, isTestProposalPath } from "./fixture-tools.mjs";

export function parseFixtureHostRevision(value: unknown): typeof FIXTURE_HOST_REVISION | undefined {
  if (value !== undefined && value !== FIXTURE_HOST_REVISION) throw Error("Unsupported fixture host revision.");
  return value;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const boundedString = (value: unknown): value is string => typeof value === "string" && value.length <= FIXTURE_ARGUMENT_CHARS;

/** Validate retained data only. Never interpret, execute or assess proposed source. */
export function parseFixtureToolCalls(value: unknown, files: Readonly<Record<string, string>>, revision: typeof FIXTURE_HOST_REVISION | undefined): ToolCall[] {
  if (!Array.isArray(value) || value.length > 100) throw Error("Invalid fixture call trace.");
  let proposalBytes = 0;
  return value.map(v => {
    if (!record(v) || typeof v.tool !== "string" || (v.status !== "returned" && v.status !== "rejected") || typeof v.at !== "string" || !Number.isFinite(Date.parse(v.at))) throw Error("Invalid fixture call.");
    const call: ToolCall = { tool: v.tool, status: v.status, at: v.at };
    if (v.proposal !== undefined) {
      const p = v.proposal;
      if (v.tool !== "propose_patch" || v.status !== "returned" || v.testProposal !== undefined || !record(p) || Object.keys(p).length !== 4 || !boundedString(p.path) || !Object.hasOwn(files, p.path) || !boundedString(p.patch) || !boundedString(p.rationale) || p.applied !== false) throw Error("Invalid recorded patch proposal.");
      call.proposal = { path: p.path, patch: p.patch, rationale: p.rationale, applied: false };
    }
    if (v.testProposal !== undefined) {
      const p = v.testProposal;
      if (revision !== FIXTURE_HOST_REVISION || v.tool !== "draft_test_proposal" || v.status !== "returned" || v.proposal !== undefined || !record(p) || Object.keys(p).length !== 3 || !boundedString(p.path) || !isTestProposalPath(p.path) || Object.hasOwn(files, p.path) || !boundedString(p.content) || p.applied !== false) throw Error("Invalid recorded test proposal.");
      call.testProposal = { path: p.path, content: p.content, applied: false };
    }
    if (v.status === "returned" && (v.tool === "search_text" || v.tool === "draft_test_proposal")) {
      if (revision !== FIXTURE_HOST_REVISION || (v.tool === "draft_test_proposal" && !call.testProposal)) throw Error("Missing fixture host provenance or test proposal.");
    }
    const proposal = call.proposal ?? call.testProposal;
    if (proposal) proposalBytes += new TextEncoder().encode(JSON.stringify(proposal)).length;
    if (proposalBytes > FIXTURE_PROPOSAL_BYTES) throw Error("Proposal recording budget exceeded.");
    return call;
  });
}
