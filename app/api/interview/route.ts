import { NextResponse } from "next/server";
import { interviewPrep } from "@/lib/ai";
import { enrichJob } from "@/lib/enrich";
import { getSettings, updateJob } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };
  const job = await enrichJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const r = await interviewPrep(job, getSettings());
    return NextResponse.json(updateJob(id, { interview: { ...r, at: new Date().toISOString() } })?.interview);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
