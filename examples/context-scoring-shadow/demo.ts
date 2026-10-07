import type { ContextShadowInput, ScoringAdapter, ScoringCall } from "./types.js";

/** Small invented example; labels and cache assumptions never enter Noul requests. */
export const DEMO_INPUT: ContextShadowInput = {
  task: "Why does this request time out?",
  chunks: [
    {
      id: "timeout_config",
      text: "Synthetic config: requestTimeoutMs is set to 250, and retryCount is 0.",
      relevant: true,
    },
    {
      id: "timeout_caller",
      text: "Synthetic caller: the request waits for the profile lookup before returning.",
      relevant: true,
    },
    {
      id: "button_styles",
      text: "Synthetic styling note: the settings page uses a rounded blue button.",
      relevant: false,
    },
  ],
  // The aggregate alone cannot tell us what the context segment itself cached.
  cacheObservations: { aggregateCachedInputTokens: 1200 },
};

const SCRIPTED_PROBABILITIES: Readonly<Record<string, number>> = Object.freeze({
  timeout_config: 0.94,
  timeout_caller: 0.68,
  button_styles: 0.08,
});

/** Scripted evidence is stable by chunk id and never reads evaluation labels. */
export const scriptedFakeAdapter: ScoringAdapter = Object.freeze({
  kind: "scripted_fake",
  async score(call: ScoringCall) {
    const answers = Object.fromEntries(
      Object.keys(call.questionToChunkId).map(questionId => {
        const chunkId = call.questionToChunkId[questionId]!;
        return [
          questionId,
          Object.hasOwn(SCRIPTED_PROBABILITIES, chunkId)
            ? SCRIPTED_PROBABILITIES[chunkId]!
            : 0.5,
        ];
      }),
    );
    return { source: "scripted_fake", model: call.body.model, answers };
  },
});
