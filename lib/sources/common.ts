import { Settings } from "../types";

/** Поисковые запросы к API: ключевые слова (не больше 6, чтобы не долбить площадки) */
export function queries(s: Settings): string[] {
  const q = s.keywords.map((k) => k.trim()).filter(Boolean);
  return Array.from(new Set(q)).slice(0, 6);
}
