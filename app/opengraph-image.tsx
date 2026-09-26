import { ImageResponse } from "next/og"

export const alt = "Jev Harness — unofficial community review and routing experiments"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Public editorial artwork only: no request data, provider calls, or credentials.
export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px 64px", background: "#080e16", color: "#f5f7fb", borderTop: "8px solid #f0a5ca", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: "#a3e7d7" }}>TYPESAFEAI / UNOFFICIAL COMMUNITY</div>
      <div style={{ display: "flex", marginTop: 48, fontSize: 72, fontWeight: 700 }}>Jev Harness</div>
      <div style={{ display: "flex", marginTop: 18, fontSize: 34, color: "#f0a5ca" }}>Evidence is not authorization.</div>
      <div style={{ display: "flex", marginTop: 28, fontSize: 25, color: "#acb8c9" }}>Proposal review · Typed evidence · Host-owned authority</div>
      <div style={{ display: "flex", gap: 20, marginTop: 42 }}>
        {["Propose", "Review evidence", "Host decides"].map((label) => (
          <div key={label} style={{ display: "flex", flex: 1, padding: "22px 24px", border: "1px solid #34404f", borderRadius: 12, background: "#101924", fontSize: 25 }}>{label}</div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 24, borderTop: "1px solid #34404f", fontSize: 20 }}>
        <span>TypeSafeAI / jev-harness</span>
        <span style={{ color: "#a3e7d7" }}>Community-built. Not official.</span>
      </div>
    </div>,
    size
  )
}
