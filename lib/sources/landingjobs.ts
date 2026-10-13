import { RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";

// Официальный публичный API Landing.jobs (в основном Европа). Берём только remote
const PAGE = 50;

export async function landingjobs(_s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (let page = 0; page < 6; page++) {
    const jobs = await fetchJson<any[]>(`https://landing.jobs/api/v1/jobs?limit=${PAGE}&offset=${page * PAGE}`);
    for (const j of jobs) {
      if (!j.remote) continue;
      const locs = (j.locations ?? []).map((l: any) => [l.city, l.country_code].filter(Boolean).join(", ")).join("; ");
      const sal =
        j.gross_salary_low || j.gross_salary_high
          ? `${j.gross_salary_low ?? "?"} – ${j.gross_salary_high ?? "?"} ${j.currency_code ?? "EUR"} / год`
          : undefined;
      out.push({
        source: "landingjobs",
        sourceLabel: "Landing.jobs",
        url: j.url,
        title: j.title,
        // Компания есть только в адресе: landing.jobs/at/<company>/<job>
        company: (j.url?.match(/\/at\/([^/]+)\//)?.[1] ?? "").replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        location: locs ? `Remote · ${locs}` : "Remote",
        tags: j.tags ?? [],
        employment: j.type,
        salary: sal,
        description: cleanHtml(
          [j.role_description, j.main_requirements && `<h3>Requirements</h3>${j.main_requirements}`, j.nice_to_have && `<h3>Nice to have</h3>${j.nice_to_have}`, j.perks && `<h3>Perks</h3>${j.perks}`]
            .filter(Boolean)
            .join(""),
        ),
        postedAt: toIso(j.published_at),
        enriched: true,
      });
    }
    if (jobs.length < PAGE) break;
  }
  return out;
}
