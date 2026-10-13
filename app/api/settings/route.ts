import { NextResponse } from "next/server";
import { rescoreAll } from "@/lib/scan";
import { getSettings, setSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
  const s = setSettings(await req.json());
  rescoreAll();
  return NextResponse.json(s);
}
