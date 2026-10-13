import { RawJob, Settings } from "../types";
import { cleanHtml, decodeEntities, politeFetchText, toIso } from "../util";
import { queries } from "./common";

// API hh закрыт для соискателей, поэтому читаем публичные страницы сайта (без входа, только чтение).
// Данные берём из встроенного состояния страницы <template id="HH-Lux-InitialState">.

const EXPERIENCE: Record<string, string> = {
  noExperience: "Без опыта",
  between1And3: "Опыт 1–3 года",
  between3And6: "Опыт 3–6 лет",
  moreThan6: "Опыт 6+ лет",
};

function domainFor(area: string) {
  return area === "40" ? "hh.kz" : area === "16" ? "rabota.by" : area === "97" ? "hh.uz" : "hh.ru";
}

function initialState(html: string): any {
  const m = html.match(/<template[^>]*id="HH-Lux-InitialState"[^>]*>([\s\S]*?)<\/template>/);
  if (!m) throw new Error("hh: не найден блок данных на странице (изменилась разметка или капча)");
  return JSON.parse(decodeEntities(m[1]));
}

function salaryStr(c: any): string | undefined {
  if (!c || (!c.from && !c.to)) return;
  const f = (n: number) => n.toLocaleString("ru-RU");
  const range = c.from && c.to ? (c.from === c.to ? f(c.from) : `${f(c.from)} – ${f(c.to)}`) : c.from ? `от ${f(c.from)}` : `до ${f(c.to)}`;
  const cur = c.currencyCode === "RUR" ? "RUB" : c.currencyCode;
  return `${range} ${cur}${c.gross ? " до вычета" : ""} / мес`;
}

export async function hh(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const areas = s.hhAreas.length ? s.hhAreas : ["40"];
  const period = Math.min(30, Math.max(1, s.maxAgeDays || 30));
  for (const area of areas) {
    const domain = domainFor(area);
    for (const q of queries(s)) {
      for (let page = 0; page < 3; page++) {
        const url =
          `https://${domain}/search/vacancy?text=${encodeURIComponent(q)}&area=${area}` +
          `&work_format=REMOTE&search_period=${period}&items_on_page=50&order_by=publication_time&page=${page}`;
        const res = initialState(await politeFetchText(url)).vacancySearchResult;
        const items: any[] = res?.vacancies ?? [];
        for (const v of items) {
          const logo = (v.company?.logos?.logo ?? []).find((l: any) => l["@type"] === "searchResultsPage")?.["@url"];
          const host = v.displayHost || domain;
          out.push({
            source: "hh",
            sourceLabel: domain,
            url: v.links?.desktop || `https://${host}/vacancy/${v.vacancyId}`,
            title: v.name,
            company: v.company?.visibleName || v.company?.name || "",
            companyLogo: logo ? (logo.startsWith("http") ? logo : `https://${domain}${logo}`) : undefined,
            location: `Удалённо · ${v.area?.name ?? ""}`,
            geo: area === "40" ? "ok" : "maybe",
            // hh нашёл вакансию по запросу q (в описании) — фиксируем это для скоринга
            tags: [EXPERIENCE[v.workExperience], `поиск: ${q}`].filter(Boolean) as string[],
            employment: v.employmentForm === "FULL" ? "Полная занятость" : v.employmentForm === "PART" ? "Частичная" : v.employmentForm,
            salary: salaryStr(v.compensation),
            description: "",
            postedAt: toIso(v.publicationTime?.$ ?? v.creationTime),
          });
        }
        if (items.length < 50) break;
      }
    }
  }
  return out;
}

export async function hhFullDescription(url: string): Promise<{ description: string; tags: string[] } | undefined> {
  const st = initialState(await politeFetchText(url));
  const v = st.vacancyView?.vacancyFull?.vacancy;
  if (!v?.description) return;
  return { description: cleanHtml(v.description), tags: (v.keySkills ?? []).map(String) };
}
