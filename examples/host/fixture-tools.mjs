/** Pure host limits shared by the Node fixture process and browser artifact readers. */
export const FIXTURE_HOST_REVISION = 1;
export const FIXTURE_ARGUMENT_CHARS = 16_000;
export const FIXTURE_PROPOSAL_BYTES = 256_000;
export const SEARCH_MATCH_LIMIT = 100;
// Serialized search-data object, before the MCP text/JSON-RPC envelope.
export const SEARCH_DATA_BYTES = 64_000;

/** @param {unknown} path */
export function isTestProposalPath(path) {
  if (typeof path !== "string" || path.length > FIXTURE_ARGUMENT_CHARS || /[\\:\u0000-\u001f\u007f-\u009f]/.test(path)) return false;
  if (path.split("/").some(part => !part || part === "." || part === "..")) return false;
  return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(path);
}
