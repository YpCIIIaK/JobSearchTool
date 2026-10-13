import { RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";

// В основном Европа (Германия), берём только remote
export async function arbeitnow(_s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (let page = 1; page <= 4; page++) {
    const data = await fetchJson<{ data: any[] }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of data.data ?? []) {
      if (!j.remote) continue;
      out.push({
        source: "arbeitnow",
        sourceLabel: "Arbeitnow",
        url: j.url,
        title: j.title,
        company: j.company_name,
        location: j.location ? `Remote · ${j.location}` : "Remote",
        geo: "maybe",
        tags: j.tags ?? [],
        employment: (j.job_types ?? []).join(", "),
        description: cleanHtml(j.description),
        postedAt: toIso(j.created_at),
      });
    }
  }
  return out;
}
