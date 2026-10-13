import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 3600 } });
    const data = await res.json();
    const free = (data.data as any[])
      .filter((m) => m.id === "openrouter/free" || (m.id.endsWith(":free") && !/safety|lyria/i.test(m.id)))
      .map((m) => ({ id: m.id, name: m.name, context: m.context_length }));
    return NextResponse.json(free);
  } catch (e: any) {
    return NextResponse.json([{ id: "openrouter/free", name: "OpenRouter Free Router", context: 0 }]);
  }
}
