import { createDemoServer } from "../examples/routing/server.js";
const port = Number(process.argv[2] ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Choose a port between 1024 and 65535.");
const server = createDemoServer();
server.on("error", error => { console.error(`Demo could not start: ${error.message}`); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Routing room: http://127.0.0.1:${port} — synthetic, offline, no execution`));
