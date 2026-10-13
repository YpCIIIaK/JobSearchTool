import { RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";
import { queries } from "./common";

export async function jobicy(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const q of queries(s)) {
    const data = await fetchJson<{ jobs?: any[] }>(
      `https://jobicy.com/api/v2/remote-jobs?count=100&tag=${encodeURIComponent(q)}`,
    );
    for (const j of data.jobs ?? []) {
      const sal =
        j.annualSalaryMin || j.annualSalaryMax
          ? `${j.annualSalaryMin ?? "?"} – ${j.annualSalaryMax ?? "?"} ${j.salaryCurrency || "USD"} / год`
          : undefined;
      out.push({
        source: "jobicy",
        sourceLabel: "Jobicy",
        url: j.url,
        title: j.jobTitle,
        company: j.companyName,
        companyLogo: j.companyLogo,
        location: j.jobGeo || "Worldwide",
        tags: [...(j.jobIndustry ?? []), j.jobLevel].filter(Boolean).map((t: string) => t.replace(/&amp;/g, "&")),
        employment: (j.jobType ?? []).join(", "),
        salary: sal,
        description: cleanHtml(j.jobDescription),
        postedAt: toIso(j.pubDate),
      });
    }
  }
  return out;
}
