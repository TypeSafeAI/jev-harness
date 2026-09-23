import { MAX_RUNS, type HistoryStorage } from "./history.js";
export const ASSESSMENT_KEY = "jev-arena-assessments-v1";
export type AnswerAssessment = "unreviewed" | "pass" | "fail";
/** Human notes only; never provider evidence, authorization or an automated score. */
export interface Assessment { runId: string; baseline: AnswerAssessment; integrated: AnswerAssessment; note: string; updatedAt: string }
export interface AssessmentState { entries: Assessment[]; error: string | null }
function parse(value: unknown): Assessment {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
  const v = value as Record<string, unknown>;
  if (typeof v.runId !== "string" || !v.runId || v.runId.length > 100 || !["unreviewed", "pass", "fail"].includes(v.baseline as string) || !["unreviewed", "pass", "fail"].includes(v.integrated as string) || typeof v.note !== "string" || v.note.length > 1000 || typeof v.updatedAt !== "string" || !Number.isFinite(Date.parse(v.updatedAt))) throw Error();
  return { runId: v.runId, baseline: v.baseline as AnswerAssessment, integrated: v.integrated as AnswerAssessment, note: v.note, updatedAt: v.updatedAt };
}
export function pairedPass(entry: Assessment | undefined) { return entry?.baseline === "pass" && entry.integrated === "pass"; }
export function readAssessments(storage: HistoryStorage): AssessmentState {
  let raw: string | null;
  try { raw = storage.getItem(ASSESSMENT_KEY); } catch { return { entries: [], error: "Assessment storage is unavailable." }; }
  if (raw === null) return { entries: [], error: null };
  try {
    if (raw.length > 200_000) throw Error();
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > MAX_RUNS) throw Error();
    const entries = value.entries.map(parse) as Assessment[];
    if (new Set(entries.map(e => e.runId)).size !== entries.length) throw Error();
    return { entries, error: null };
  } catch { return { entries: [], error: "Saved assessments could not be read. Download available evidence before clearing assessments." }; }
}
export function saveAssessment(storage: HistoryStorage, value: Assessment, retainedIds: readonly string[], expected: Assessment | undefined): AssessmentState & { saved: boolean } {
  const previous = readAssessments(storage);
  if (previous.error) return { ...previous, saved: false };
  try {
    const entry = parse(value);
    if (!retainedIds.includes(entry.runId)) throw Error();
    const current = previous.entries.find(value => value.runId === entry.runId);
    const version = (value: Assessment | undefined) => value ? JSON.stringify([value.runId, value.baseline, value.integrated, value.note]) : null;
    // Compare edited content, not timestamps from otherwise identical saves.
    if (version(current) !== version(expected ? parse(expected) : undefined)) {
      return { ...previous, error: "Assessment changed in another tab. Your draft has not been saved. Reload the saved assessment before retrying.", saved: false };
    }
    const entries = [entry, ...previous.entries.filter(e => e.runId !== entry.runId && retainedIds.includes(e.runId))].slice(0, MAX_RUNS);
    storage.setItem(ASSESSMENT_KEY, JSON.stringify({ version: 1, entries }));
    return { entries, error: null, saved: true };
  } catch { return { ...previous, error: "Assessment could not be saved. Keep the form open and retry after checking browser storage.", saved: false }; }
}
export function clearAssessments(storage: HistoryStorage): string | null {
  try { storage.removeItem(ASSESSMENT_KEY); return null; } catch { return "Assessments could not be cleared. Check browser storage."; }
}
