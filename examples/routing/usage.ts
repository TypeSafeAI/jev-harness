export interface UsageEntry { at: string; status: "success" | "failed" | "cancelled"; input: number | null; output: number | null; latencyMs: number | null; keySource: "personal" | "host" }
const validNumber = (n: unknown) => n === null || typeof n === "number" && Number.isFinite(n) && n >= 0;
export function parseEntries(raw: string | null): UsageEntry[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    return value.slice(0, 200).filter(e => e && typeof e.at === "string" && Number.isFinite(Date.parse(e.at)) && ["success", "failed", "cancelled"].includes(e.status) && ["personal", "host"].includes(e.keySource) && [e.input, e.output, e.latencyMs].every(validNumber)).map(e => ({ at: e.at, status: e.status, input: e.input, output: e.output, latencyMs: e.latencyMs, keySource: e.keySource }));
  } catch { return []; }
}
export function summarizeUsage(entries: readonly UsageEntry[]) {
  return { requests: entries.length, input: entries.reduce((n, e) => n + (e.input ?? 0), 0), output: entries.reduce((n, e) => n + (e.output ?? 0), 0), unknown: entries.filter(e => e.input === null || e.output === null).length };
}
const STORAGE = "jev-harness-session-usage-v1";
let entries: UsageEntry[] | null = null;
export function getUsage() {
  if (entries === null) { try { entries = parseEntries(sessionStorage.getItem(STORAGE)); } catch { entries = []; } }
  return entries;
}
export function recordUsage(entry: UsageEntry) {
  entries = [entry, ...getUsage()].slice(0, 200);
  try { sessionStorage.setItem(STORAGE, JSON.stringify(entries)); } catch { /* Memory-only remains usable. */ }
  window.dispatchEvent(new Event("jev-usage-change"));
}
export function clearUsage() { entries = []; try { sessionStorage.removeItem(STORAGE); } catch {} window.dispatchEvent(new Event("jev-usage-change")); }
