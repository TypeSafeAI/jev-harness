/** Bounded MCP fixture host. No tool executes model-proposed code or reads user files. */
import { readFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const trace = process.argv[3];
const respond = (id, value) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...value }) + "\n");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", line => {
  if (line.length > 64_000) return;
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (!Object.hasOwn(message, "id")) return;
  if (message.method === "initialize") return respond(message.id, { result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "jev-synthetic-arena", version: "1.0.0" } } });
  if (message.method === "ping") return respond(message.id, { result: {} });
  if (message.method === "tools/list") return respond(message.id, { result: { tools: manifest.tools.map(tool => ({ name: tool.id, description: tool.description, inputSchema: tool.inputSchema })) } });
  if (message.method !== "tools/call") return respond(message.id, { error: { code: -32601, message: "Unsupported method" } });
  const tool = manifest.tools.find(tool => tool.id === message.params?.name);
  const args = message.params?.arguments;
  let data, failed = false;
  if (!tool || !args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties, key)) || tool.inputSchema.required.some(key => !Object.hasOwn(args, key)) || Object.entries(args).some(([key, value]) => typeof value !== tool.inputSchema.properties[key]?.type || typeof value === "string" && value.length > 16000)) { data = { error: "Unavailable tool or invalid arguments." }; failed = true; }
  else if (tool.id === "read_file") { data = Object.hasOwn(manifest.files, args.path) ? { path: args.path, content: manifest.files[args.path], source: "synthetic fixture" } : { error: "Unknown fixture path." }; failed = Boolean(data.error); }
  else if (tool.id === "propose_patch") { data = Object.hasOwn(manifest.files, args.path) ? { status: "recorded_pending", applied: false, note: "Proposal recorded for display only. No validation of patch correctness and no file changes." } : { error: "Unknown fixture path." }; failed = Boolean(data.error); }
  else if (tool.id === "inspect_agent") data = { source: "deterministic synthetic inspector, not a model subagent", files: manifest.files, note: "Compare the named exported constants to the question. Nothing changed." };
  else { data = { error: "No handler." }; failed = true; }
  appendFileSync(trace, JSON.stringify({ tool: tool?.id ?? "unknown", status: failed ? "rejected" : "returned", at: new Date().toISOString() }) + "\n");
  respond(message.id, { result: { content: [{ type: "text", text: JSON.stringify(data) }], isError: failed } });
});
