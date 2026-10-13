import { NextResponse } from "next/server";
import { getProgress, startScan } from "@/lib/scan";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getProgress());
}

export async function POST() {
  const started = startScan();
  return NextResponse.json({ started, progress: getProgress() });
}
