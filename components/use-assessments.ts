"use client";
import { useEffect, useState } from "react";
import { ASSESSMENT_KEY, clearAssessments, readAssessments, saveAssessment, type Assessment, type AssessmentState } from "../examples/arena/assessments";
export function useAssessments() {
  const [state, setState] = useState<AssessmentState>({ entries: [], error: null });
  useEffect(() => {
    const sync = () => { try { setState(readAssessments(localStorage)); } catch { setState({ entries: [], error: "Assessment storage is unavailable." }); } };
    const changed = (e: StorageEvent) => { if (e.key === ASSESSMENT_KEY || e.key === null) sync(); };
    sync(); window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, []);
  async function save(entry: Assessment, retainedIds: string[]) {
    // Capture the revision being edited before waiting for another tab's lock.
    const expected = state.entries.find(value => value.runId === entry.runId);
    const write = () => saveAssessment(localStorage, entry, retainedIds, expected);
    try { const result = await (navigator.locks ? navigator.locks.request(ASSESSMENT_KEY, write) : write()); setState(result); return result.saved; }
    catch { setState(s => ({ ...s, error: "Assessment storage is unavailable. Your changes have not been saved." })); return false; }
  }
  async function clear() {
    const remove = () => clearAssessments(localStorage);
    try { const error = await (navigator.locks ? navigator.locks.request(ASSESSMENT_KEY, remove) : remove()); setState(s => error ? { ...s, error } : { entries: [], error: null }); return !error; }
    catch { setState(s => ({ ...s, error: "Assessments could not be cleared." })); return false; }
  }
  return { ...state, save, clear };
}
