import type { Fixture, Proposal, Proposer, ReviewArm } from "../contract/types";

/**
 * Week 1 proposer: returns the fixture's scripted proposal for the arm. It sees
 * the labeled fixture by design; real-model studies use `BlindedProposer` and
 * `prepareProposerInput` from ./evaluation instead.
 *
 * Extracted from TypeSafeAI/typesafe-playground `lib/harness/proposer.ts` at
 * 2c6cac903ee3887eb72548e012c14a7aefe4f3bd.
 */
export class FixtureProposer implements Proposer {
  readonly name = "fixture";
  async propose(fixture: Fixture, arm: ReviewArm): Promise<Proposal> {
    const proposal = fixture.proposals[arm];
    if (!proposal) throw Error(`Fixture ${fixture.id} has no ${arm} proposal.`);
    return structuredClone(proposal);
  }
}
