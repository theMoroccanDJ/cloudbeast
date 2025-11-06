import { NextResponse, type NextRequest } from "next/server";

import { runDaily } from "@/lib/services/scheduler";

function parseBody(body: unknown): { orgId: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }

  const orgId = (body as { orgId?: unknown }).orgId;
  if (typeof orgId !== "string" || orgId.trim().length === 0) {
    throw new Error("orgId is required.");
  }

  return { orgId: orgId.trim() };
}

export async function POST(request: NextRequest) {
  let payload: { orgId: string };
  try {
    const data = await request.json();
    payload = parseBody(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const summary = await runDaily(payload.orgId);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Failed to run daily ingest", error);
    const message = error instanceof Error ? error.message : "Failed to run daily ingest.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
