import { GeoFit, RawJob, Settings } from "../types";
import { cleanHtml, politeFetchText, textToHtml, toIso } from "../util";

// Публичный JSON, которым пользуется сам сайт getmatch.ru (без входа). Поиск по слову API игнорирует,
// поэтому берём свежие вакансии постранично и фильтруем удалёнку у себя; ключевые слова — в скоринге
const PAGE = 100;
const PAGES = 4;

function geoOf(items: any[]): GeoFit {
  const remote = items.filter((l) => l.format === "remote" && !l.exclude);
  if (remote.some((l) => /весь мир|world|казахстан|kazakhstan|снг/i.test(l.label ?? ""))) return "ok";
  return "maybe";
}

function salary(o: any): string | undefined {
  if (o.salary_hidden || (!o.salary_display_from && !o.salary_display_to)) return;
  const f = (n: number) => n.toLocaleString("ru-RU");
  const cur = o.salary_currency === "RUR" ? "RUB" : o.salary_currency ?? "";
  const range =
    o.salary_display_from && o.salary_display_to
      ? `${f(o.salary_display_from)} – ${f(o.salary_display_to)}`
      : o.salary_display_from
        ? `от ${f(o.salary_display_from)}`
        : `до ${f(o.salary_display_to)}`;
  return `${range} ${cur} / мес${o.salary_taxes === "gross" ? " до вычета" : ""}`;
}

export async function getmatch(_s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (let page = 0; page < PAGES; page++) {
    // Как с hh: по одному запросу с паузой
    const data: { offers: any[] } = JSON.parse(
      await politeFetchText(`https://getmatch.ru/api/offers?limit=${PAGE}&offset=${page * PAGE}`, {
        headers: { Accept: "application/json" },
      }),
    );
    const offers = data.offers ?? [];
    for (const o of offers) {
      if (o.offer_type !== "vacancy" || !o.is_active) continue;
      const locs: any[] = o.location_items ?? [];
      if (!locs.some((l) => l.format === "remote" && !l.exclude)) continue;
      const desc = String(o.offer_description ?? "");
      out.push({
        source: "getmatch",
        sourceLabel: "Getmatch",
        url: `https://getmatch.ru${o.url}`,
        title: o.position,
        company: o.company?.name ?? "",
        companyLogo: o.company?.logotype ? `https://getmatch.ru/uploads/${o.company.logotype}` : undefined,
        location: locs
          .filter((l) => !l.exclude)
          .map((l) => `${l.label}${l.format === "remote" ? " (удалённо)" : ""}`)
          .join(", "),
        geo: geoOf(locs),
        tags: [...(o.skills_objects ?? []).map((x: any) => x.name), o.english_level?.name].filter(Boolean).slice(0, 12),
        salary: salary(o),
        description: cleanHtml(/<[a-z]/i.test(desc) ? desc.replace(/\n/g, "<br>") : textToHtml(desc)),
        postedAt: toIso(o.published_at),
        enriched: true,
      });
    }
    if (offers.length < PAGE) break;
  }
  return out;
}
