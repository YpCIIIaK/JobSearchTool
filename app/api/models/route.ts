import { NextResponse } from "next/server";

export const revalidate = 3600;

export interface CatalogModel {
  id: string;
  name: string;
  context: number;
  free: boolean;
  price?: string; // $ за 1M входных токенов
}

// Каталог OpenRouter — для подсказок при вводе. Выбор не ограничен: можно вписать любой слаг
export async function GET() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 3600 } });
    const data = await res.json();
    const list: CatalogModel[] = (data.data as any[])
      .filter((m) => !/safety|lyria|embed|moderation/i.test(m.id))
      .map((m) => {
        const prompt = Number(m.pricing?.prompt ?? 0);
        const completion = Number(m.pricing?.completion ?? 0);
        const free = m.id === "openrouter/free" || m.id.endsWith(":free") || (prompt === 0 && completion === 0);
        return {
          id: m.id,
          name: m.name,
          context: m.context_length ?? 0,
          free,
          price: free ? undefined : `$${+(prompt * 1e6).toFixed(2)}`,
        };
      })
      // Бесплатные сверху, дальше по алфавиту
      .sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
    return NextResponse.json(list);
  } catch {
    return NextResponse.json([{ id: "openrouter/free", name: "OpenRouter Free Router", context: 0, free: true }]);
  }
}
