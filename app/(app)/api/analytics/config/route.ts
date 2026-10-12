export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ enabled: process.env.ANALYTICS_EVENTS_V2 === "true" }, { headers: { "Cache-Control": "no-store" } });
}
