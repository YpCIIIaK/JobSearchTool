import { NextResponse } from "next/server";
import { writeLetter } from "@/lib/ai";
import { enrichJob } from "@/lib/enrich";
import { getSettings, updateJob } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { id, lang = "auto", note } = (await req.json()) as { id: string; lang?: "auto" | "ru" | "en"; note?: string };
  // Письмо пишется по полному описанию — догружаем его, если ещё нет
  const job = await enrichJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const r = await writeLetter(job, getSettings(), { lang, note });
    const updated = updateJob(id, { letter: { ...r, at: new Date().toISOString() } });
    return NextResponse.json(updated?.letter);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
