import { RawJob, Settings } from "../types";
import { cleanHtml, fetchJson, toIso } from "../util";

export async function workingnomads(_s: Settings): Promise<RawJob[]> {
  const data = await fetchJson<any[]>("https://www.workingnomads.com/api/exposed_jobs/");
  return data.map((j) => ({
    source: "workingnomads" as const,
    sourceLabel: "Working Nomads",
    url: j.url,
    title: j.title,
    company: j.company_name,
    location: j.location || "Anywhere",
    tags: [j.category_name, ...String(j.tags || "").split(",")].map((t) => t?.trim()).filter(Boolean),
    description: cleanHtml(j.description),
    postedAt: toIso(j.pub_date),
  }));
}
