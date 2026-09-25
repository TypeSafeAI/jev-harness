import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Manual frozen comparison only; the host retains one attempt per case, with no retries.
const cwd = process.cwd();
const packageRoot = '/tmp/jev-performance-2026-09-24/pinned-package';
const executable = resolve(packageRoot, 'bin/codex');
const expectedCliHash = '0196e89fe5a7598f816ee54232c3d7c26d75e502ab5cfe2c9240e81d90f7255a';
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const packageManifestPath = '/tmp/jev-performance-2026-09-24/pinned-package-manifest.json';
const packageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'));
const packageMatches = () => packageManifest.files.every((entry: {path: string; sha256: string}) => hash(resolve(packageRoot, entry.path)) === entry.sha256) && hash(executable) === expectedCliHash;
if (!packageMatches()) throw Error('Pinned CLI package changed; no run started.');
const args = process.argv.slice(2);
const prefix = ['--live', '--model', 'gpt-6-sol', '--runs', '3', '--with-prerequisites', '--out'];
if (args.length !== prefix.length + 1 || !prefix.every((arg, index) => args[index] === arg) || !args.at(-1)?.endsWith('.json')) throw Error('Expected the fixed live three-repetition protocol with a fresh JSON output path.');
if (process.env.CI) throw Error('Manual live experiment refused under CI.');
const out = resolve(args.at(-1)!);
const provenancePath = out.replace(/\.json$/, '-provenance.json');
const completionPath = out.replace(/\.json$/, '-completion.json');
if ([out, provenancePath, completionPath].some(existsSync)) throw Error('Choose fresh output paths.');
if (git('status', '--porcelain')) throw Error('Source checkout must be clean and frozen.');
const sourceCommit = git('rev-parse', 'HEAD');
const files = git('ls-files', 'src', 'examples/host', 'examples/routing', 'scripts/arena-mcp.mjs', 'scripts/experiment-routing.ts', 'package.json', 'pnpm-lock.yaml').split('\n').map(path => ({path, sha256: hash(resolve(cwd, path))}));
const sourceMatches = () => git('rev-parse', 'HEAD') === sourceCommit && !git('status', '--porcelain') && files.every(entry => hash(resolve(cwd, entry.path)) === entry.sha256);
process.env.PATH = resolve(packageRoot, 'bin') + ':' + process.env.PATH;
const provenance = {sourceCommit, clean: true, startedAt: new Date().toISOString(),
  cliVersion: execFileSync(executable, ['--version'], {encoding: 'utf8'}).trim(), cliSha256: expectedCliHash,
  packageManifestSha256: hash(packageManifestPath), packageFiles: packageManifest.files,
  executableResolution: 'codex through pinned PATH; host auth-only copy enabled',
  requestedProposerModel: 'gpt-6-sol', requestedReasoningEffort: 'medium', jevModel: 'jev-1.13.0',
  pairedCasesPlanned: 57, repetitions: 3, retries: 0, argv: args,
  runnerSha256: hash(fileURLToPath(import.meta.url)), files,
  concurrency: 'Each configuration alternates paired arms sequentially. Configuration batches may overlap on one host; shared resources and provider variation limit timing conclusions.'};
writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n', {flag: 'wx', mode: 0o600});
let exitCode = 1;
try {
  const {runCli} = await import(pathToFileURL(resolve(cwd, 'examples/routing/experiment-cli.ts')).href);
  exitCode = await runCli(args, {env: process.env, cwd, codexExecutable: 'codex', stdout: (s: string) => process.stdout.write(s), stderr: (s: string) => process.stderr.write(s)});
} catch {
  process.stderr.write('Comparison wrapper failed; retain any partial evidence.\n');
} finally {
  const sourceUnchanged = sourceMatches(), packageUnchanged = packageMatches();
  writeFileSync(completionPath, JSON.stringify({sourceCommit, finishedAt: new Date().toISOString(), exitCode, sourceUnchanged, packageUnchanged, artifactPresent: existsSync(out)}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  process.exitCode = sourceUnchanged && packageUnchanged ? exitCode : 1;
}
