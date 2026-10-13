import { RawJob, Settings } from "../types";
import { cleanHtml, decodeEntities, fetchJson, toIso } from "../util";

// Вакансии прямо с карьерных страниц компаний через открытые API их ATS
type Ats = "greenhouse" | "lever" | "ashby";

const REMOTE = /remote|anywhere|worldwide|global|distributed|удал/i;

function pretty(slug: string) {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function greenhouse(slug: string): Promise<RawJob[]> {
  // Без content=true ответ в разы легче; описание догружается при открытии вакансии
  const data = await fetchJson<{ jobs: any[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return (data.jobs ?? [])
    .filter((j) => REMOTE.test(j.location?.name ?? ""))
    .map((j) => ({
      source: "ats" as const,
      sourceLabel: `${j.company_name || pretty(slug)} · Greenhouse`,
      url: j.absolute_url,
      title: j.title,
      company: j.company_name || pretty(slug),
      location: j.location?.name || "Remote",
      tags: (j.departments ?? []).map((d: any) => d.name).filter(Boolean),
      description: "",
      postedAt: toIso(j.first_published ?? j.updated_at),
    }));
}

async function lever(slug: string): Promise<RawJob[]> {
  const data = await fetchJson<any[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return data
    .filter((j) => j.workplaceType === "remote" || REMOTE.test(`${j.categories?.location} ${(j.categories?.allLocations ?? []).join(" ")}`))
    .map((j) => {
      const lists = (j.lists ?? []).map((l: any) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join("");
      return {
        source: "ats" as const,
        sourceLabel: `${pretty(slug)} · Lever`,
        url: j.hostedUrl,
        title: j.text,
        company: pretty(slug),
        location: [j.workplaceType === "remote" ? "Remote" : "", ...(j.categories?.allLocations ?? [j.categories?.location])]
          .filter(Boolean)
          .join(", "),
        tags: [j.categories?.team, j.categories?.department].filter(Boolean),
        employment: j.categories?.commitment,
        salary: j.salaryRange
          ? `${j.salaryRange.min ?? "?"} – ${j.salaryRange.max ?? "?"} ${j.salaryRange.currency ?? ""} / ${j.salaryRange.interval === "per-year-salary" ? "год" : j.salaryRange.interval ?? ""}`
          : undefined,
        description: cleanHtml(`${j.description ?? ""}${lists}${j.additional ?? ""}`),
        postedAt: toIso(j.createdAt),
        enriched: true,
      };
    });
}

async function ashby(slug: string): Promise<RawJob[]> {
  const data = await fetchJson<{ jobs: any[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
  );
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false && (j.isRemote || j.workplaceType === "Remote" || REMOTE.test(j.location ?? "")))
    .map((j) => ({
      source: "ats" as const,
      sourceLabel: `${pretty(slug)} · Ashby`,
      url: j.jobUrl,
      title: j.title,
      company: pretty(slug),
      location: [
        "Remote",
        j.location,
        ...(j.secondaryLocations ?? []).map((l: any) => l.location),
      ]
        .filter((x, i, a) => x && a.indexOf(x) === i)
        .join(", "),
      tags: [j.department, j.team].filter(Boolean),
      employment: j.employmentType,
      salary: j.compensation?.compensationTierSummary || undefined,
      description: cleanHtml(j.descriptionHtml ?? ""),
      postedAt: toIso(j.publishedAt),
    }));
}

const FETCHERS: Record<Ats, (slug: string) => Promise<RawJob[]>> = { greenhouse, lever, ashby };

export async function ats(s: Settings): Promise<RawJob[]> {
  const entries = s.atsCompanies
    .map((e) => e.trim().toLowerCase().split(":"))
    .filter(([kind, slug]) => slug && kind in FETCHERS) as [Ats, string][];
  const out: RawJob[] = [];
  const errors: string[] = [];
  // Небольшая параллельность: API открытые, но не будем долбить
  for (let i = 0; i < entries.length; i += 6) {
    const chunk = entries.slice(i, i + 6);
    const res = await Promise.allSettled(chunk.map(([kind, slug]) => FETCHERS[kind](slug)));
    res.forEach((r, k) => {
      if (r.status === "fulfilled") out.push(...r.value);
      else errors.push(`${chunk[k].join(":")}: ${r.reason?.message ?? r.reason}`);
    });
  }
  if (errors.length) console.warn("[ats]", errors.join("; "));
  if (!out.length && errors.length) throw new Error(errors.slice(0, 3).join("; "));
  return out;
}

export async function greenhouseFullDescription(url: string, company: string): Promise<string | undefined> {
  // absolute_url бывает и на сайте компании, id берём из gh_jid или из пути
  const id = url.match(/gh_jid=(\d+)/)?.[1] ?? url.match(/jobs\/(\d+)/)?.[1];
  const slug = url.match(/greenhouse\.io\/([^/]+)\/jobs/)?.[1] ?? company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!id) return;
  const j = await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`);
  return j.content ? cleanHtml(decodeEntities(j.content)) : undefined;
}
