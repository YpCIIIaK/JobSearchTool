import { NextResponse } from "next/server";
import { enrichJob } from "@/lib/enrich";
import { getJob, updateJob } from "@/lib/store";
import { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const job = await enrichJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as { status?: JobStatus; letterText?: string };
  const patch: Parameters<typeof updateJob>[1] = {};
  // Ручная смена статуса снимает пометку «скрыто ИИ»
  if (body.status) Object.assign(patch, { status: body.status, hiddenBy: body.status === "hidden" ? "user" : undefined });
  // Ручная правка сопроводительного письма
  const current = getJob(id);
  if (body.letterText != null && current?.letter) patch.letter = { ...current.letter, text: body.letterText, edited: true };
  const job = updateJob(id, patch);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}
