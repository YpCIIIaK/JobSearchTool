import { GeoFit, RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";
import { queries } from "./common";

export async function himalayas(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const q of queries(s)) {
    for (let page = 1; page <= 3; page++) {
      const data = await fetchJson<{ jobs: any[] }>(
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&page=${page}`,
      );
      const jobs = data.jobs ?? [];
      for (const j of jobs) {
        // Himalayas даёт точный список стран — лучший сигнал «можно ли из КЗ»
        const restr: string[] = j.locationRestrictions ?? [];
        const geo: GeoFit = restr.length === 0 || restr.some((c) => /kazakhstan/i.test(c)) ? "ok" : "no";
        const cur = j.currency || "USD";
        const period = j.salaryPeriod === "annual" ? "год" : j.salaryPeriod === "monthly" ? "мес" : j.salaryPeriod || "";
        out.push({
          source: "himalayas",
          sourceLabel: "Himalayas",
          url: j.applicationLink || j.guid,
          title: j.title,
          company: j.companyName,
          companyLogo: j.companyLogo,
          location:
            restr.length === 0
              ? "Worldwide"
              : restr.length > 6
                ? `${restr.slice(0, 6).join(", ")} +${restr.length - 6}`
                : restr.join(", "),
          geo,
          tags: [...(j.seniority ?? []), ...(j.categories ?? []).slice(0, 6).map((c: string) => c.replace(/-/g, " "))],
          employment: j.employmentType,
          salary: j.minSalary || j.maxSalary ? `${j.minSalary ?? "?"} – ${j.maxSalary ?? "?"} ${cur} / ${period}` : undefined,
          description: cleanHtml(j.description),
          postedAt: toIso(j.pubDate),
        });
      }
      if (jobs.length < 20) break;
    }
  }
  return out;
}
