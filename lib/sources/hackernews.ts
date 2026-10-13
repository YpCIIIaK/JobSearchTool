import { RawJob, Settings } from "../types";
import { cleanHtml, decodeEntities, fetchJson, toIso } from "../util";

// Официальный API Hacker News (Algolia): ежемесячный тред «Ask HN: Who is hiring?».
// Каждая вакансия — комментарий верхнего уровня в формате «Компания | Роль | Локация | …»
const API = "https://hn.algolia.com/api/v1";
const ROLE = /engineer|developer|programmer|designer|manager|lead|architect|scientist|analyst|devops|sre|cto|founding|frontend|backend|full[- ]?stack|product|qa|tester/i;
const PLACE = /remote|onsite|on-site|hybrid|\b(us|usa|uk|eu|emea|europe|worldwide|anywhere|canada|germany|london|nyc|sf|berlin)\b/i;

function headline(text: string): string {
  // Первая строка до первого абзаца, без ссылок
  const first = text.split(/<p>/i)[0];
  return decodeEntities(first.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseHeadline(h: string) {
  const parts = h
    .split(/\s+[|—–]\s+|\s+-\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const companyRaw = parts[0] ?? "";
  // «Acme (Remote US)» — локация в скобках у компании
  const inParens = companyRaw.match(/\(([^)]+)\)/)?.[1];
  const company = companyRaw.replace(/\s*\([^)]*\)/, "").replace(/\s*https?:\S+/, "").trim();
  const role = parts.slice(1).find((p) => ROLE.test(p) && !/^https?:/.test(p));
  const place = [inParens, ...parts.slice(1).filter((p) => PLACE.test(p) && p !== role)].filter(Boolean).join(", ");
  return { company, role, place };
}

export async function hackernews(_s: Settings): Promise<RawJob[]> {
  const threads = await fetchJson<{ hits: any[] }>(
    `${API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=6`,
  );
  // Текущий и прошлый месяц
  const hiring = threads.hits.filter((h) => /who is hiring/i.test(h.title)).slice(0, 2);
  const out: RawJob[] = [];
  for (const t of hiring) {
    const item = await fetchJson<{ children: any[] }>(`${API}/items/${t.objectID}`, {}, 40000);
    for (const c of item.children ?? []) {
      if (!c.text || !/remote/i.test(c.text)) continue;
      const h = headline(c.text);
      const { company, role, place } = parseHeadline(h);
      if (!company) continue;
      out.push({
        source: "hackernews",
        sourceLabel: "HN · Who is hiring",
        url: `https://news.ycombinator.com/item?id=${c.id}`,
        title: role ?? h.slice(company.length).replace(/^[\s|—–-]+/, "").slice(0, 120) ?? h.slice(0, 120),
        company,
        location: place || "Remote",
        tags: [],
        description: cleanHtml(decodeEntities(c.text)),
        postedAt: toIso(c.created_at),
        enriched: true,
      });
    }
  }
  return out;
}
