"use client";
import { useEffect, useState } from "react";
import { HISTORY_KEY, clearHistory, readHistory, saveRun, type ArenaRun, type HistoryState } from "../examples/arena/history";
const unavailable = "Browser storage is unavailable. Download results to keep them after closing this page.";
export function useArenaHistory() {
  const [state, setState] = useState<HistoryState>({ runs: [], error: null });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => { try { setState(readHistory(localStorage)); } catch { setState({ runs: [], error: unavailable }); } setReady(true); };
    const changed = (event: StorageEvent) => { if (event.key === HISTORY_KEY || event.key === null) sync(); };
    sync(); window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  async function locked<T>(action: () => T): Promise<T> { return navigator.locks ? navigator.locks.request(HISTORY_KEY, action) : action(); }
  async function save(run: ArenaRun) {
    try { const result = await locked(() => saveRun(localStorage, run)); setState(result); return result.saved; }
    catch { setState(value => ({ ...value, error: unavailable })); return false; }
  }
  async function clear() {
    try { const error = await locked(() => clearHistory(localStorage)); if (error) setState(value => ({ ...value, error })); else setState({ runs: [], error: null }); return !error; }
    catch { setState(value => ({ ...value, error: unavailable })); return false; }
  }
  return { ...state, ready, save, clear };
}
