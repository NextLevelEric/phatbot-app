import { NextResponse } from "next/server";

const MAX_TEXT = 4000;

function clean(value: unknown) {
  if (typeof value !== "string") return null;
  return value.slice(0, MAX_TEXT);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = {
      event: "phatbot_client_error",
      source: clean(body?.source) ?? "unknown",
      message: clean(body?.message) ?? "Unknown client error",
      digest: clean(body?.digest),
      stack: clean(body?.stack),
      path: clean(body?.path),
      userAgent: clean(body?.userAgent),
      clientTimestamp: clean(body?.timestamp),
      serverTimestamp: new Date().toISOString(),
    };

    console.error(JSON.stringify(event));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("PHATBOT client-error ingestion failed", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
