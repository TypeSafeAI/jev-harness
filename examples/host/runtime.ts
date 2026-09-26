import { createLiveHandler } from "./live";
import { HOST_ROUTING_RECOVERY } from "../routing/host-policy";
export const liveHandle = createLiveHandler({ recovery: HOST_ROUTING_RECOVERY, ...(process.env.TYPESAFE_API_KEY ? { serverKey: process.env.TYPESAFE_API_KEY } : {}) });
