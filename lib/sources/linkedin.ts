import { RawJob, Settings } from "../types";
import { cleanHtml, decodeEntities, politeFetchText, toIso } from "../util";
import { queries } from "./common";

// Публичная гостевая выдача LinkedIn (то же, что видно без входа). Только чтение, с паузами.
const BASE = "https://www.linkedin.com/jobs-guest/jobs/api";
// Локации на английском — так их понимает гео-детектор
const EN = { headers: { "Accept-Language": "en-US,en;q=0.9" } };

const text = (s?: string) => (s ? decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "");

export async function linkedin(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const locations = s.linkedinLocations.length ? s.linkedinLocations : ["Worldwide"];
  // f_WT=2 — удалённо; f_TPR — давность в секундах
  const tpr = `r${Math.min(30, Math.max(1, s.maxAgeDays || 30)) * 86400}`;
  const errors: string[] = [];
  for (const loc of locations) {
    for (const q of queries(s)) {
      for (const start of [0, 10, 20]) {
        let html: string;
        try {
          html = await politeFetchText(`${BASE}/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent(loc)}&f_WT=2&f_TPR=${tpr}&start=${start}`, EN);
        } catch (e: any) {
          errors.push(e.message);
          break;
        }
        const cards = html.split("<li>").slice(1);
        for (const c of cards) {
          const id = c.match(/jobPosting:(\d+)/)?.[1];
          if (!id) continue;
          const logo = c.match(/data-delayed-url="([^"]+company-logo[^"]+)"/)?.[1];
          const salary = text(c.match(/job-search-card__salary-info[^>]*>([\s\S]*?)<\/span>/)?.[1]);
          out.push({
            source: "linkedin",
            sourceLabel: "LinkedIn",
            url: `https://www.linkedin.com/jobs/view/${id}/`,
            title: text(c.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/)?.[1]),
            company: text(c.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/)?.[1]),
            companyLogo: logo ? decodeEntities(logo) : undefined,
            location: `Remote · ${text(c.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/)?.[1])}`,
            tags: [`поиск: ${q}`],
            salary: salary || undefined,
            description: "",
            postedAt: toIso(c.match(/<time[^>]*datetime="([^"]+)"/)?.[1]),
          });
        }
        if (cards.length < 10) break;
      }
    }
  }
  if (!out.length && errors.length) throw new Error(errors[0]);
  return out;
}

export async function linkedinFullDescription(url: string): Promise<{ description: string; tags: string[]; employment?: string } | undefined> {
  const id = url.match(/view\/(?:[^/]*-)?(\d+)/)?.[1];
  if (!id) return;
  const html = await politeFetchText(`${BASE}/jobPosting/${id}`, EN);
  const start = html.indexOf("show-more-less-html__markup");
  if (start < 0) return;
  const open = html.indexOf(">", start) + 1;
  const end = html.indexOf("</div>", open);
  const criteria: Record<string, string> = {};
  for (const m of html.matchAll(/description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/g))
    criteria[text(m[1])] = text(m[2]);
  return {
    description: cleanHtml(html.slice(open, end)),
    tags: [criteria["Seniority level"], criteria["Industries"]].filter(Boolean),
    employment: criteria["Employment type"],
  };
}
