import { NextResponse } from "next/server";
import { analyzeIds } from "@/lib/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; ids?: string[]; force?: boolean };
  const ids = body.ids ?? (body.id ? [body.id] : []);
  const r = await analyzeIds(ids.slice(0, 20), { force: body.force });
  if (!Object.keys(r.results).length && r.error) return NextResponse.json(r, { status: 502 });
  return NextResponse.json(r);
}
