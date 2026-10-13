import { habrFullDescription } from "./sources/habr";
import { hhFullDescription } from "./sources/hh";
import { greenhouseFullDescription } from "./sources/ats";
import { linkedinFullDescription } from "./sources/linkedin";
import { getJob, updateJob } from "./store";
import { Job } from "./types";

/**
 * Догружает полное описание со страницы вакансии там, где выдача даёт только заголовок/сниппет.
 * Делается лениво: при открытии вакансии и перед ИИ-анализом, чтобы не делать сотни запросов при скане.
 */
export async function enrichJob(id: string): Promise<Job | undefined> {
  const job = getJob(id);
  if (!job || job.enriched) return job;
  try {
    let patch: Partial<Job> | undefined;
    if (job.source === "hh") {
      const r = await hhFullDescription(job.url);
      if (r) patch = { description: r.description, tags: mergeTags(job.tags, r.tags) };
    } else if (job.source === "linkedin") {
      const r = await linkedinFullDescription(job.url);
      if (r) patch = { description: r.description, tags: mergeTags(job.tags, r.tags), employment: r.employment ?? job.employment };
    } else if (job.source === "habr" && job.description.length < 1200) {
      const d = await habrFullDescription(job.url);
      if (d) patch = { description: d };
    } else if (job.source === "ats" && !job.description) {
      const d = await greenhouseFullDescription(job.url, job.company);
      if (d) patch = { description: d };
    }
    return updateJob(id, { ...patch, enriched: true });
  } catch (e) {
    console.warn("[enrich]", job.source, (e as Error).message);
    return job;
  }
}

function mergeTags(a: string[], b: string[]) {
  // Служебный тег «поиск: …» больше не нужен, когда есть настоящие навыки
  const base = b.length ? a.filter((t) => !t.startsWith("поиск: ")) : a;
  return Array.from(new Set([...base, ...b]));
}
