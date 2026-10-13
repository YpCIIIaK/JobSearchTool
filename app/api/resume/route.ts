import { NextResponse } from "next/server";
import { tailorResume } from "@/lib/ai";
import { enrichJob } from "@/lib/enrich";
import { getSettings, updateJob } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { id, lang = "auto" } = (await req.json()) as { id: string; lang?: "auto" | "ru" | "en" };
  const job = await enrichJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const r = await tailorResume(job, getSettings(), lang);
    return NextResponse.json(updateJob(id, { resume: { ...r, at: new Date().toISOString() } })?.resume);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
