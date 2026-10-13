import { RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";

// RemoteOK отдаёт последние ~100 вакансий одним списком, фильтруем локально скорингом
export async function remoteok(_s: Settings): Promise<RawJob[]> {
  const data = await fetchJson<any[]>("https://remoteok.com/api");
  return data
    .filter((j) => j && j.id && j.position)
    .map((j) => ({
      source: "remoteok" as const,
      sourceLabel: "RemoteOK",
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      title: j.position,
      company: j.company,
      companyLogo: j.company_logo || j.logo || undefined,
      location: j.location || "Worldwide",
      tags: j.tags ?? [],
      salary:
        j.salary_min && j.salary_max
          ? `$${j.salary_min.toLocaleString()} – $${j.salary_max.toLocaleString()} / год`
          : undefined,
      description: cleanHtml(j.description),
      postedAt: toIso(j.epoch ?? j.date),
    }));
}
