/**
 * Offline, per-question look at recorded proposal-review runs (issue #5).
 *
 *   pnpm exec tsx scripts/analyze-review-runs.ts <run.json> [<run.json> ...] [--json]
 *
 * Reads recorded bench result files (the playground's
 * `docs/proposal-review-results*.json` shape), keeps only `plus_jev` receipts
 * that carry answers, and reports per-question confidence distributions,
 * per-question floor sweeps, which question catches each bad arm, and
 * run-to-run variance. It makes no provider call and changes no policy: the
 * pooled sweep reuses `decide()` exactly as shipped. Output is development
 * evidence on synthetic, re-sampled fixtures, not a calibration.
 *
 * Labels: a fixture's expected verdict can be corrected between runs. When the
 * same (fixture, arm) carries different `plus_jev` expectations across inputs,
 * the label from the input with the latest `at` timestamp wins and the conflict
 * is reported, so a pre-fix run is scored against the corrected label.
 * Explicit runIndex values in repeated artifacts identify separate logical
 * runs; legacy files without indexes continue to represent one run each.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { decide, FAVORABLE } from "../src/contract/decide.js";
import { REVIEW_QUESTION_IDS, type JevReview, type ReviewAnswer, type ReviewQuestionId } from "../src/contract/types.js";

export type ArmClass = "good_permit" | "good_clarify" | "bad";

export type RunAnswer = ReviewAnswer;

export interface RunFile {
  at: string;
  model?: string;
  threshold?: number;
  repetitions?: number;
  runs: Array<{ fixtureId: string; category: string; arm: string; mode: string; expected: string; runIndex?: number }>;
  receipts: Array<{
    fixtureId: string;
    arm: string;
    mode: string;
    validation: unknown;
    jev: JevReview | null;
    runIndex?: number;
  }>;
}

export interface Observation {
  run: number;
  fixtureId: string;
  category: string;
  arm: "good" | "bad";
  expected: string;
  cls: ArmClass;
  validation: unknown;
  jev: unknown;
  answers: Record<ReviewQuestionId, RunAnswer>;
}

export interface LabelConflict { fixtureId: string; arm: string; labels: Array<{ run: number; expected: string }>; used: string }

export const FLOORS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95] as const;

function classify(arm: string, expected: string): ArmClass {
  if (arm === "bad") return "bad";
  return expected === "permit" ? "good_permit" : "good_clarify";
}

/** Preserve legacy order and reject incomplete indexing before any rows are filtered. */
function logicalRuns(files: readonly RunFile[]): RunFile[] {
  return files.flatMap(file => {
    const entries = [...file.runs, ...file.receipts];
    const hasPlan = Object.hasOwn(file, "repetitions");
    if (!hasPlan && !entries.some(row => Object.hasOwn(row, "runIndex"))) return [file];
    if (hasPlan && (!Number.isSafeInteger(file.repetitions) || file.repetitions! < 1))
      throw Error("Indexed artifact needs a positive repetition count for runIndex validation.");
    for (const row of entries) {
      if (!Object.hasOwn(row, "runIndex") || !Number.isSafeInteger(row.runIndex) || row.runIndex! < 1 || (hasPlan && row.runIndex! > file.repetitions!))
        throw Error("Every indexed artifact row and receipt needs a valid positive runIndex within its repetition plan.");
    }
    const rowIndexes = new Set(file.runs.map(row => row.runIndex!));
    const receiptIndexes = new Set(file.receipts.map(row => row.runIndex!));
    if (rowIndexes.size !== receiptIndexes.size || [...rowIndexes].some(index => !receiptIndexes.has(index)))
      throw Error("Indexed artifact rows and receipts must contain matching runIndex values.");
    return [...rowIndexes].sort((a, b) => a - b).map(runIndex => ({
      ...file,
      runs: file.runs.filter(row => row.runIndex === runIndex),
      receipts: file.receipts.filter(row => row.runIndex === runIndex),
    }));
  });
}

/** Flatten runs into answered plus_jev observations with reconciled labels. */
export function collect(files: readonly RunFile[]): { observations: Observation[]; conflicts: LabelConflict[]; skipped: number } {
  return collectLogicalRuns(logicalRuns(files));
}

function collectLogicalRuns(files: readonly RunFile[]): { observations: Observation[]; conflicts: LabelConflict[]; skipped: number } {
  const labels = new Map<string, Array<{ run: number; at: string; expected: string; category: string }>>();
  files.forEach((file, run) => {
    for (const row of file.runs) {
      if (row.mode !== "plus_jev") continue;
      const key = `${row.fixtureId}\u0000${row.arm}`;
      const list = labels.get(key) ?? [];
      list.push({ run, at: file.at, expected: row.expected, category: row.category });
      labels.set(key, list);
    }
  });
  const resolved = new Map<string, { expected: string; category: string }>();
  const conflicts: LabelConflict[] = [];
  for (const [key, list] of labels) {
    const latest = [...list].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
    resolved.set(key, { expected: latest.expected, category: latest.category });
    if (new Set(list.map(l => l.expected)).size > 1) {
      const [fixtureId, arm] = key.split("\u0000") as [string, string];
      conflicts.push({ fixtureId, arm, labels: list.map(({ run, expected }) => ({ run, expected })), used: latest.expected });
    }
  }
  const observations: Observation[] = [];
  let skipped = 0;
  files.forEach((file, run) => {
    for (const r of file.receipts) {
      if (r.mode !== "plus_jev") continue;
      if (!r.jev || !r.jev.answers) { skipped++; continue; }
      const label = resolved.get(`${r.fixtureId}\u0000${r.arm}`);
      if (!label) throw Error(`No plus_jev label for ${r.fixtureId}/${r.arm}`);
      if (r.arm !== "good" && r.arm !== "bad") throw Error(`Unknown arm ${r.arm}`);
      const answers = {} as Record<ReviewQuestionId, RunAnswer>;
      for (const id of REVIEW_QUESTION_IDS) {
        const a = r.jev.answers[id];
        if (!a) throw Error(`${r.fixtureId}/${r.arm} run ${run}: missing ${id}`);
        answers[id] = a;
      }
      observations.push({
        run, fixtureId: r.fixtureId, category: label.category, arm: r.arm, expected: label.expected,
        cls: classify(r.arm, label.expected), validation: r.validation, jev: r.jev, answers,
      });
    }
  });
  return { observations, conflicts, skipped };
}

const favorable = (id: ReviewQuestionId, a: RunAnswer) => a.answer === FAVORABLE[id];

/**
 * Why one well-formed question answer fails an observation at a floor.
 *
 * This helper only classifies canonical recorded answers into direction versus
 * confidence misses. Malformed review envelopes and malformed answer triples are
 * handled by `decide()` in the pooled sweep, not split out here.
 */
export function miss(id: ReviewQuestionId, a: RunAnswer, floor: number): "direction" | "confidence" | null {
  if (!favorable(id, a)) return "direction";
  if (a.confidence < floor) return "confidence";
  return null;
}

export interface Distribution {
  question: ReviewQuestionId;
  cls: ArmClass;
  n: number;
  favorable: number;
  unfavorable: number;
  favorableMin: number | null;
  favorableMax: number | null;
  unfavorableMin: number | null;
  unfavorableMax: number | null;
}

const minOf = (v: number[]) => (v.length ? Math.min(...v) : null);
const maxOf = (v: number[]) => (v.length ? Math.max(...v) : null);

export function distributions(obs: readonly Observation[]): Distribution[] {
  const out: Distribution[] = [];
  for (const question of REVIEW_QUESTION_IDS)
    for (const cls of ["good_permit", "good_clarify", "bad"] as const) {
      const rows = obs.filter(o => o.cls === cls).map(o => o.answers[question]);
      const fav = rows.filter(a => favorable(question, a)).map(a => a.confidence);
      const unf = rows.filter(a => !favorable(question, a)).map(a => a.confidence);
      out.push({
        question, cls, n: rows.length, favorable: fav.length, unfavorable: unf.length,
        favorableMin: minOf(fav), favorableMax: maxOf(fav), unfavorableMin: minOf(unf), unfavorableMax: maxOf(unf),
      });
    }
  return out;
}

export interface SweepRow {
  question: ReviewQuestionId;
  floor: number;
  /** good arms expected to permit that this question fails at this floor */
  goodBlocked: number;
  /** ...and where it is the only failing question at this floor */
  goodBlockedSole: number;
  badCaughtDirection: number;
  badCaughtConfidence: number;
  /** bad arms that this question is the only one to fail at this floor */
  badCaughtSole: number;
  /** clarification-expected good arms this question holds */
  clarifyHeld: number;
}

export function questionSweep(obs: readonly Observation[], floors: readonly number[] = FLOORS): SweepRow[] {
  const out: SweepRow[] = [];
  for (const question of REVIEW_QUESTION_IDS)
    for (const floor of floors) {
      const row: SweepRow = { question, floor, goodBlocked: 0, goodBlockedSole: 0, badCaughtDirection: 0, badCaughtConfidence: 0, badCaughtSole: 0, clarifyHeld: 0 };
      for (const o of obs) {
        const m = miss(question, o.answers[question], floor);
        if (!m) continue;
        const sole = REVIEW_QUESTION_IDS.every(q => q === question || !miss(q, o.answers[q], floor));
        if (o.cls === "good_permit") {
          row.goodBlocked++;
          if (sole) row.goodBlockedSole++;
        } else if (o.cls === "good_clarify") row.clarifyHeld++;
        else {
          if (m === "direction") row.badCaughtDirection++;
          else row.badCaughtConfidence++;
          if (sole) row.badCaughtSole++;
        }
      }
      out.push(row);
    }
  return out;
}

export interface PooledRow { floor: number; goodPermitBlocked: number; goodPermitTotal: number; clarifyPermitted: number; badPermitted: number; badTotal: number }

/** Whole-table sweep using the shipped decide(), one threshold for all questions. */
export function pooledSweep(obs: readonly Observation[], floors: readonly number[] = FLOORS): PooledRow[] {
  return floors.map(floor => {
    const row: PooledRow = { floor, goodPermitBlocked: 0, goodPermitTotal: 0, clarifyPermitted: 0, badPermitted: 0, badTotal: 0 };
    for (const o of obs) {
      const permitted = decide(o.validation, o.jev, floor).verdict === "permit";
      if (o.cls === "good_permit") { row.goodPermitTotal++; if (!permitted) row.goodPermitBlocked++; }
      else if (o.cls === "good_clarify") { if (permitted) row.clarifyPermitted++; }
      else { row.badTotal++; if (permitted) row.badPermitted++; }
    }
    return row;
  });
}

export interface BadCatch { fixtureId: string; category: string; runs: number; direction: Partial<Record<ReviewQuestionId, number>>; confidenceOnly: number; minFavorableConfidence: Partial<Record<ReviewQuestionId, number>> }

/** For each bad arm: which questions point the wrong way, and how often, at the floor. */
export function badCatches(obs: readonly Observation[], floor = 0.8): BadCatch[] {
  const by = new Map<string, Observation[]>();
  for (const o of obs.filter(o => o.cls === "bad")) by.set(o.fixtureId, [...(by.get(o.fixtureId) ?? []), o]);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fixtureId, rows]) => {
    const direction: Partial<Record<ReviewQuestionId, number>> = {};
    const minFav: Partial<Record<ReviewQuestionId, number>> = {};
    let confidenceOnly = 0;
    for (const o of rows) {
      let anyDirection = false;
      let anyConfidence = false;
      for (const q of REVIEW_QUESTION_IDS) {
        const m = miss(q, o.answers[q], floor);
        if (m === "direction") { direction[q] = (direction[q] ?? 0) + 1; anyDirection = true; }
        if (m === "confidence") anyConfidence = true;
        if (favorable(q, o.answers[q])) minFav[q] = Math.min(minFav[q] ?? 1, o.answers[q].confidence);
      }
      if (!anyDirection && anyConfidence) confidenceOnly++;
    }
    return { fixtureId, category: rows[0]!.category, runs: rows.length, direction, confidenceOnly, minFavorableConfidence: minFav };
  });
}

export interface Variance { question: ReviewQuestionId; pairs: number; meanRange: number; maxRange: number; maxRangeAt: string; flips: Array<{ fixtureId: string; arm: string; probabilities: number[] }> }

/** Spread of the yes-probability for the same (fixture, arm) across runs. */
export function variance(obs: readonly Observation[]): Variance[] {
  const by = new Map<string, Observation[]>();
  for (const o of obs) { const k = `${o.fixtureId}/${o.arm}`; by.set(k, [...(by.get(k) ?? []), o]); }
  return REVIEW_QUESTION_IDS.map(question => {
    let sum = 0; let pairs = 0; let maxRange = 0; let maxRangeAt = "";
    const flips: Variance["flips"] = [];
    for (const [key, rows] of by) {
      if (rows.length < 2) continue;
      const ps = rows.map(r => r.answers[question].probability);
      const range = Math.max(...ps) - Math.min(...ps);
      sum += range; pairs++;
      if (range > maxRange) { maxRange = range; maxRangeAt = key; }
      if (new Set(rows.map(r => r.answers[question].answer)).size > 1)
        flips.push({ fixtureId: rows[0]!.fixtureId, arm: rows[0]!.arm, probabilities: ps });
    }
    return { question, pairs, meanRange: pairs ? sum / pairs : 0, maxRange, maxRangeAt, flips };
  });
}

/**
 * Descriptive only: the highest swept floor at which this question alone blocks
 * no permit-expected good arm, and what it catches there. Not a recommendation.
 */
export function highestFloorWithoutGoodBlock(sweep: readonly SweepRow[]): Array<{ question: ReviewQuestionId; floor: number | null; badCaught: number }> {
  return REVIEW_QUESTION_IDS.map(question => {
    const row = sweep.filter(r => r.question === question && r.goodBlocked === 0).at(-1);
    return { question, floor: row?.floor ?? null, badCaught: row ? row.badCaughtDirection + row.badCaughtConfidence : 0 };
  });
}

export function analyze(files: readonly RunFile[]) {
  const expanded = logicalRuns(files);
  const { observations, conflicts, skipped } = collectLogicalRuns(expanded);
  const sweep = questionSweep(observations);
  return {
    runs: expanded.length,
    observations: observations.length,
    byClass: {
      good_permit: observations.filter(o => o.cls === "good_permit").length,
      good_clarify: observations.filter(o => o.cls === "good_clarify").length,
      bad: observations.filter(o => o.cls === "bad").length,
    },
    skippedWithoutAnswers: skipped,
    labelConflicts: conflicts,
    distributions: distributions(observations),
    categoryDistributions: [...new Set(observations.map(o => o.category))].sort().map(category => ({
      category, rows: distributions(observations.filter(o => o.category === category)).filter(d => d.n > 0),
    })),
    questionSweep: sweep,
    highestFloorWithoutGoodBlock: highestFloorWithoutGoodBlock(sweep),
    pooledSweep: pooledSweep(observations),
    badCatches: badCatches(observations),
    variance: variance(observations),
    goodPermitMisses: observations
      .filter(o => o.cls === "good_permit")
      .flatMap(o => REVIEW_QUESTION_IDS.flatMap(q => {
        const m = miss(q, o.answers[q], 0.8);
        return m ? [{ run: o.run, fixtureId: o.fixtureId, question: q, miss: m, answer: o.answers[q].answer, confidence: o.answers[q].confidence }] : [];
      })),
  };
}

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

export function toMarkdown(result: ReturnType<typeof analyze>): string {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);
  push(`Runs: ${result.runs}; answered plus_jev observations: ${result.observations} (good expected permit ${result.byClass.good_permit}, good expected proposal_only ${result.byClass.good_clarify}, bad ${result.byClass.bad}); plus_jev receipts without answers: ${result.skippedWithoutAnswers}.`, "");
  if (result.labelConflicts.length) {
    push("Label conflicts (latest-run label used):", "");
    for (const c of result.labelConflicts) push(`- ${c.fixtureId}/${c.arm}: ${c.labels.map(l => `run ${l.run + 1}=${l.expected}`).join(", ")} → ${c.used}`);
    push("");
  }
  push("## Distribution (confidence of the direction answered)", "", "| question | arm class | n | favorable | fav min | fav max | unfavorable | unf min | unf max |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const d of result.distributions) push(`| ${d.question} | ${d.cls} | ${d.n} | ${d.favorable} | ${pct(d.favorableMin)} | ${pct(d.favorableMax)} | ${d.unfavorable} | ${pct(d.unfavorableMin)} | ${pct(d.unfavorableMax)} |`);
  push("", "## By category", "");
  for (const c of result.categoryDistributions) {
    push(`### ${c.category}`, "", "| question | arm class | n | favorable | fav min | fav max | unfavorable | unf max |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const d of c.rows) push(`| ${d.question} | ${d.cls} | ${d.n} | ${d.favorable} | ${pct(d.favorableMin)} | ${pct(d.favorableMax)} | ${d.unfavorable} | ${pct(d.unfavorableMax)} |`);
    push("");
  }
  push("## Per-question floor sweep", "", "good blocked = permit-expected good arms this question fails (sole = no other question fails). bad caught = direction miss + confidence-only miss by this question.", "", "| question | floor | good blocked | good blocked (sole) | bad caught (direction) | bad caught (confidence) | bad caught (sole) | clarify held |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of result.questionSweep) push(`| ${r.question} | ${pct(r.floor)} | ${r.goodBlocked} | ${r.goodBlockedSole} | ${r.badCaughtDirection} | ${r.badCaughtConfidence} | ${r.badCaughtSole} | ${r.clarifyHeld} |`);
  push("", "## Pooled sweep (shipped decide(), one floor)", "", "| floor | good (permit-expected) blocked | clarify-expected permitted | bad permitted |", "| ---: | ---: | ---: | ---: |");
  for (const r of result.pooledSweep) push(`| ${pct(r.floor)} | ${r.goodPermitBlocked}/${r.goodPermitTotal} | ${r.clarifyPermitted} | ${r.badPermitted}/${r.badTotal} |`);
  push("", "## Which question catches each bad arm (at 80%)", "", `| fixture | category | runs | direction misses by question | confidence-only catches |`, "| --- | --- | ---: | --- | ---: |");
  for (const b of result.badCatches) push(`| ${b.fixtureId} | ${b.category} | ${b.runs} | ${REVIEW_QUESTION_IDS.filter(q => b.direction[q]).map(q => `${q} ${b.direction[q]}/${b.runs}`).join(", ") || "none"} | ${b.confidenceOnly} |`);
  push("", "## Permit-expected good arms held at 80%", "", "| run | fixture | question | miss | answer | confidence |", "| ---: | --- | --- | --- | --- | ---: |");
  for (const m of result.goodPermitMisses) push(`| ${m.run + 1} | ${m.fixtureId} | ${m.question} | ${m.miss} | ${m.answer} | ${pct(m.confidence)} |`);
  push("", "## Run-to-run variance of the yes-probability", "", "| question | fixture-arm pairs | mean range | max range | at | direction flips |", "| --- | ---: | ---: | ---: | --- | --- |");
  for (const v of result.variance) push(`| ${v.question} | ${v.pairs} | ${v.meanRange.toFixed(3)} | ${v.maxRange.toFixed(2)} | ${v.maxRangeAt} | ${v.flips.map(f => `${f.fixtureId}/${f.arm} [${f.probabilities.join(", ")}]`).join("; ") || "none"} |`);
  push("", "## Highest swept floor per question that blocks no permit-expected good arm (descriptive, not a recommendation)", "", "| question | floor | bad observations this question catches there |", "| --- | ---: | ---: |");
  for (const h of result.highestFloorWithoutGoodBlock) push(`| ${h.question} | ${pct(h.floor)} | ${h.badCaught} |`);
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const paths = args.filter(a => a !== "--json");
  if (!paths.length) {
    console.error("usage: pnpm exec tsx scripts/analyze-review-runs.ts <run.json> [...] [--json]");
    process.exit(2);
  }
  const result = analyze(paths.map(p => JSON.parse(readFileSync(p, "utf8")) as RunFile));
  console.log(json ? JSON.stringify(result, null, 2) : toMarkdown(result));
}
