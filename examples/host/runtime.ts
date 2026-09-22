import { createLiveHandler } from "./live";
export const liveHandle = createLiveHandler(process.env.TYPESAFE_API_KEY ? { serverKey: process.env.TYPESAFE_API_KEY } : {});
