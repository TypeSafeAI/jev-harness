import { liveHandle } from "../../../examples/host/runtime";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: Request) => liveHandle(request);
