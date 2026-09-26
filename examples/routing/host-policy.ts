/** Deliberate host activation point. Candidate demo policy, enabled for its frozen comparison; effectiveness remains unmeasured. */
import type { RoutingRecovery } from "./measurement.js";
export const HOST_ROUTING_RECOVERY: RoutingRecovery = "probability_sum_only_v1";
export const arenaSetupVersion = (recovery: RoutingRecovery): 6 | 7 => recovery === "none" ? 6 : 7;
