"use client";
import { useId, useRef, type ReactNode } from "react";
/** Native modal semantics keep focus inside the drawer and restore it on close. */
export function DetailPanel({ title, trigger, children, triggerClass = "" }: { title: string; trigger: ReactNode; children: ReactNode; triggerClass?: string }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  return <><button type="button" className={`detail-trigger ${triggerClass}`} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{trigger}<span className="detail-arrow" aria-hidden="true">↗</span></button><dialog ref={dialog} className="detail-dialog" aria-labelledby={titleId} onClick={event => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close(); }}><div className="detail-dialog-heading"><div><p className="eyebrow">Agent arena</p><h2 id={titleId}>{title}</h2></div><button className="quiet" aria-label="Close details" onClick={() => dialog.current?.close()} autoFocus>Close <span aria-hidden="true">×</span></button></div><div className="detail-dialog-body">{children}</div></dialog></>;
}
