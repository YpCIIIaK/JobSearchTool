import { RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";
import { queries } from "./common";

export async function remotive(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const q of queries(s)) {
    const data = await fetchJson<{ jobs: any[] }>(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=100`,
    );
    for (const j of data.jobs ?? []) {
      out.push({
        source: "remotive",
        sourceLabel: "Remotive",
        url: j.url,
        title: j.title,
        company: j.company_name,
        companyLogo: j.company_logo || j.company_logo_url,
        location: j.candidate_required_location || "Worldwide",
        tags: j.tags ?? [],
        employment: j.job_type?.replace(/_/g, " "),
        salary: j.salary || undefined,
        description: cleanHtml(j.description),
        postedAt: toIso(j.publication_date),
      });
    }
  }
  return out;
}
