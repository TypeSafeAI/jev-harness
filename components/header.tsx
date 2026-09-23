"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { KEY_STORAGE, readApiKey, saveApiKey } from "../examples/routing/api-key";
import { clearUsage, getUsage, summarizeUsage, type UsageEntry } from "../examples/routing/usage";
export function Header() {
  const keyDialog = useRef<HTMLDialogElement>(null), usageDialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false), [draft, setDraft] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const total = summarizeUsage(entries);
  useEffect(() => {
    const syncKey = () => setSaved(Boolean(readApiKey()));
    const syncUsage = () => setEntries([...getUsage()]);
    const syncStoredKey = (event: StorageEvent) => { if (event.key === KEY_STORAGE || event.key === null) { syncKey(); setDraft(""); setError(""); setNotice(""); } };
    syncKey(); syncUsage();
    window.addEventListener("storage", syncStoredKey); window.addEventListener("jev-key-change", syncKey); window.addEventListener("jev-usage-change", syncUsage);
    return () => { window.removeEventListener("storage", syncStoredKey); window.removeEventListener("jev-key-change", syncKey); window.removeEventListener("jev-usage-change", syncUsage); };
  }, []);
  function save(value: string) {
    try { saveApiKey(value); setDraft(""); setError(""); setSaved(Boolean(value.trim())); setNotice(value.trim() ? "Manual override saved. Your next comparison will use this key." : "Manual override removed. Your next comparison will use the server default if configured."); window.dispatchEvent(new Event("jev-key-change")); return true; }
    catch { setNotice(""); setError("Could not update the override. Check the key format and browser storage permissions."); return false; }
  }
  return <><header className="masthead"><div className="header-bar"><Link className="wordmark" href="/" aria-label="Jev Harness agent arena">jev<span> / agent arena</span></Link><div className="header-actions"><button className="quiet" id="usage-open" onClick={() => usageDialog.current?.showModal()}>Usage{total.requests ? ` · ${total.requests}` : ""}</button><button className="quiet" id="key-settings" aria-haspopup="dialog" aria-controls="key-dialog" aria-label={saved ? "Settings, manual key override active" : "Settings"} onClick={() => keyDialog.current?.showModal()}>Settings{saved && <span className="key-override-dot" aria-hidden="true" />}</button><a className="github-link" href="https://github.com/TypeSafeAI/jev-harness" target="_blank" rel="noopener noreferrer" aria-label="View Jev Harness on GitHub (opens in a new tab)" title="View source on GitHub"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.23c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a11 11 0 0 1 5.75 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.4-5.26 5.69.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg></a></div></div></header>
    <dialog ref={keyDialog} id="key-dialog" className="detail-dialog settings-dialog" aria-labelledby="key-title" onClose={() => { setDraft(""); setError(""); setNotice(""); }}>
      <div className="detail-dialog-heading"><div><p className="eyebrow">Agent arena</p><h2 id="key-title">Settings</h2></div><button className="quiet" aria-label="Close settings" onClick={() => keyDialog.current?.close()} autoFocus>Close <span aria-hidden="true">×</span></button></div>
      <div className="detail-dialog-body">
        <section aria-labelledby="key-section-title">
          <h3 id="key-section-title">Jev API key</h3>
          <p className="hint">Set a manual TypeSafe API key override for comparisons in this browser.</p>
          <div className={`key-source-card ${saved ? "has-override" : ""}`}><span>Active key source</span><strong>{saved ? "Manual override" : "Server default"}</strong><p>{saved ? "Your saved key takes priority over the server key. Replace it below or remove the override to return to the default." : "Uses the server key when configured. Save your own key below to override it."}</p></div>
          <form onSubmit={event => { event.preventDefault(); if (draft.trim()) save(draft); }}>
            <label htmlFor="api-key">{saved ? "Replacement API key" : "Override API key"}</label>
            <input id="api-key" type="password" value={draft} onChange={event => setDraft(event.target.value)} aria-describedby="key-storage-note" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={1024} required placeholder="Paste your TypeSafe API key" />
            <p id="key-storage-note" className="hint">Stored unencrypted on this device for this origin. The saved key is never shown again or included in results. Only explicit live requests use it.</p>
            <div className="dialog-actions"><button className="primary" type="submit" disabled={!draft.trim()}>{saved ? "Replace override" : "Save override"}</button><button className="quiet" type="button" disabled={!saved} onClick={() => save("")}>Remove override</button></div>
            <p role="alert" className="key-message key-error">{error}</p><p role="status" className="key-message">{notice}</p>
          </form>
        </section>
      </div>
    </dialog>
    <dialog ref={usageDialog} id="usage-dialog" aria-labelledby="usage-title"><div className="dialog-heading"><h2 id="usage-title">Usage &amp; budget</h2><button className="quiet" aria-label="Close usage dashboard" onClick={() => usageDialog.current?.close()}>Close</button></div><p className="hint">This tab's latest 200 live Jev requests · survives refresh. Account-wide quotas and balances are unavailable.</p><div className="usage-totals"><div><span>Requests</span><strong id="usage-requests">{total.requests}</strong></div><div><span>Reported input</span><strong id="usage-input">{total.input.toLocaleString()}</strong></div><div><span>Reported output</span><strong id="usage-output">{total.output.toLocaleString()}</strong></div></div><p id="usage-unknown" className="hint">{total.unknown ? `${total.unknown} requests have incomplete usage. Totals include reported tokens only.` : total.requests ? "All listed requests have reported token usage." : "Run a comparison to see Jev usage. Agent CLI usage is shown in each result."}</p><div className="usage-price"><span>Reported-input price estimate</span><strong>${(total.input * 42 / 1_000_000_000).toFixed(8)}</strong><p className="hint">At <a href="https://typesafe.ai/" target="_blank" rel="noopener noreferrer">$42 per billion input tokens</a> (checked Sep 22, 2026). Excludes output, unknown usage and account-specific pricing. Not an invoice.</p></div><details><summary>Request history</summary><div className="table-scroll"><table><caption>Provider-reported tokens. Missing usage stays unknown.</caption><thead><tr>{["Time", "Status", "Input", "Output", "Duration"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{entries.map((entry, index) => <tr key={index}><td>{new Date(entry.at).toLocaleTimeString()}</td><td>{entry.status} · {entry.keySource} key</td><td>{entry.input ?? "Unknown"}</td><td>{entry.output ?? "Unknown"}</td><td>{entry.latencyMs === null ? "Unknown" : `${(entry.latencyMs / 1000).toFixed(2)} s`}</td></tr>)}</tbody></table></div></details><details><summary>Request limits</summary><p className="hint">Local host: 30 starts/minute, 2 concurrent across keys and tabs. Local safeguards, not account quotas. Billing (402) and rate-limit (429) failures remain visible. No automatic retries.</p></details><button id="usage-clear" className="quiet" onClick={clearUsage}>Clear local usage history</button></dialog>
  </>;
}
