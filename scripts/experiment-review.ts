import { runReviewCli } from "../examples/review/experiment-cli.js";

process.exitCode = await runReviewCli(process.argv.slice(2), {
  env: process.env,
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(text),
});
