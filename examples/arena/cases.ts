export const ARENA_CASES = [
  { id: "read", title: "Read a tiny module", task: "Read src/sum.ts in the synthetic workspace. Explain what sum([2, 3]) returns, citing the file.", files: { "src/sum.ts": "export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);\n" } },
  { id: "patch", title: "Propose a focused fix", task: "Propose a patch for src/sum.ts to return 0 for an empty array. Record the proposed diff with propose_patch; never apply it.", files: { "src/sum.ts": "export const sum = (values: number[]) => values.reduce((total, value) => total + value);\n" } },
  { id: "inspect", title: "Inspect a timeout", task: "Ask inspect_agent to inspect the synthetic config and explain which timeout controls a request. Do not change anything.", files: { "src/config.ts": "export const requestTimeoutMs = 3000;\nexport const idleTimeoutMs = 30000;\n" } },
  { id: "ambiguous", title: "Know when to ask", task: "Improve it.", files: { "src/helper.ts": "export const label = (value: string) => value.trim();\n" } },
] as const;
export type ArenaCase = (typeof ARENA_CASES)[number];
