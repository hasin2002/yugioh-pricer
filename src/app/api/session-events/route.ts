import { sessionEventsUrlForRequest } from "@/server/session-events";

export async function GET(request: Request) {
  const url = await sessionEventsUrlForRequest(request);

  return Response.json({
    url,
  });
}
