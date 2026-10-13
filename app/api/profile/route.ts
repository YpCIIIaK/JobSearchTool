import { NextResponse } from "next/server";
import { extractProfile } from "@/lib/ai";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Принимает несохранённые ключ/профиль/модель из формы, чтобы не требовать сохранения перед разбором
export async function POST(req: Request) {
  const body = (await req.json()) as { profile?: string; openrouterKey?: string; aiModels?: string[]; aiProvider?: string; aiBaseUrl?: string; aiApiKey?: string; aiCustomModels?: string[]; aiBuiltinFallback?: boolean };
  const s = { ...getSettings(), ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
  try {
    return NextResponse.json(await extractProfile(s));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
