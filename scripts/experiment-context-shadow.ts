import { main } from "../examples/context-scoring-shadow/cli.js";

process.exitCode = await main(process.argv.slice(2), {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(text),
});
