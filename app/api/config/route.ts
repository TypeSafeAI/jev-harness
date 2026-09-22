export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ live: true, serverKey: Boolean(process.env.TYPESAFE_API_KEY) }, { headers: { "Cache-Control": "no-store" } }); }
