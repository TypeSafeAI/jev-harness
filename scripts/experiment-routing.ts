import { main } from "../examples/routing/experiment-cli.js";
process.exitCode = await main(process.argv.slice(2), { env: process.env, stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text) });
