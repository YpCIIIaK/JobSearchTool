import { AI_BATCH, aiCacheKey, analyzeJobs, profileHash } from "./ai";
import { enrichJob } from "./enrich";
import { allJobs, getCachedAi, getSettings, putCachedAi, updateJob } from "./store";
import { AiVerdict, Job } from "./types";

export interface AnalyzeResult {
  results: Record<string, AiVerdict>;
  fromCache: number;
  analyzed: number;
  error?: string;
}

/** Действительная оценка из кэша для вакансии (если резюме с тех пор не менялось) */
export function cachedVerdict(job: Pick<Job, "title" | "company">): AiVerdict | undefined {
  const ai = getCachedAi(aiCacheKey(job));
  return ai && ai.profileHash === profileHash(getSettings()) ? ai : undefined;
}

/** Применяет оценку ко всем вакансиям-дублям (та же вакансия с другой площадки) */
function applyEverywhere(key: string, ai: AiVerdict, results: Record<string, AiVerdict>) {
  for (const j of allJobs()) {
    if (aiCacheKey(j) === key) {
      updateJob(j.id, { ai });
      results[j.id] = ai;
    }
  }
}

export async function analyzeIds(
  ids: string[],
  opts: { force?: boolean; onProgress?: (done: number) => void } = {},
): Promise<AnalyzeResult> {
  const s = getSettings();
  const res: AnalyzeResult = { results: {}, fromCache: 0, analyzed: 0 };
  const todo: Job[] = [];
  for (const id of ids) {
    const job = await enrichJob(id);
    if (!job) continue;
    const cached = opts.force ? undefined : cachedVerdict(job);
    if (cached) {
      updateJob(id, { ai: cached });
      res.results[id] = cached;
      res.fromCache++;
    } else todo.push(job);
  }
  opts.onProgress?.(res.fromCache);
  for (let i = 0; i < todo.length; i += AI_BATCH) {
    const batch = todo.slice(i, i + AI_BATCH);
    try {
      const map = await analyzeJobs(batch, s);
      for (const job of batch) {
        const ai = map.get(job.id);
        if (!ai) continue;
        const key = aiCacheKey(job);
        putCachedAi(key, ai);
        applyEverywhere(key, ai, res.results);
        res.analyzed++;
      }
    } catch (e: any) {
      res.error = e.message;
      break; // лимит или ключ — дальше смысла нет
    }
    opts.onProgress?.(res.fromCache + res.analyzed);
  }
  return res;
}
