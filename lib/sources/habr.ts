import { XMLParser } from "fast-xml-parser";
import { RawJob, Settings } from "../types";
import { arr, cleanHtml, fetchText, textToHtml, toIso } from "../util";
import { queries } from "./common";

export async function habr(s: Settings): Promise<RawJob[]> {
  const parser = new XMLParser();
  const out: RawJob[] = [];
  for (const q of queries(s)) {
    const xml = await fetchText(
      `https://career.habr.com/vacancies/rss?q=${encodeURIComponent(q)}&remote=true&sort=date`,
    );
    for (const it of arr<any>(parser.parse(xml)?.rss?.channel?.item)) {
      const raw = String(it.title ?? "");
      const m = raw.match(/«(.+)»(?:\s*\((.+)\))?\s*$/);
      const desc = String(it.description ?? "");
      const skills = desc.match(/Требуемые навыки:\s*(.+?)\.?$/)?.[1];
      out.push({
        source: "habr",
        sourceLabel: "Хабр Карьера",
        url: it.link,
        title: m?.[1] ?? raw,
        company: String(it.author ?? ""),
        companyLogo: it.image,
        location: "Удалённо",
        geo: "maybe",
        tags: skills ? skills.split(",").map((t) => t.trim().replace(/^#/, "")) : [],
        // В скобках бывает и город — зарплатой считаем только текст с цифрами
        salary: m?.[2] && /\d/.test(m[2]) ? m[2] : undefined,
        description: textToHtml(desc),
        postedAt: toIso(it.pubDate),
      });
    }
  }
  return out;
}

/** Полное описание со страницы вакансии (RSS даёт только краткое) */
export async function habrFullDescription(url: string): Promise<string | undefined> {
  const html = await fetchText(url);
  const start = html.indexOf('class="vacancy-description__text"');
  if (start < 0) return;
  const open = html.indexOf(">", start) + 1;
  // Берём блок до следующей крупной секции страницы
  const endCandidates = ['class="vacancy-section"', 'class="basic-section', "<footer"]
    .map((m) => html.indexOf(m, open))
    .filter((i) => i > 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : open + 20000;
  return cleanHtml(html.slice(open, end));
}
