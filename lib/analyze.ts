import { AI_BATCH, aiCacheKey, analyzeJobs, PRESCREEN_BATCH, prescreenJobs, profileHash } from "./ai";
import { enrichJob } from "./enrich";
import { allJobs, getCachedAi, getJob, getSettings, putCachedAi, updateJob } from "./store";
import { AiVerdict, Job } from "./types";

export interface AnalyzeResult {
  results: Record<string, AiVerdict>;
  fromCache: number;
  analyzed: number;
  prescreened: number; // отсеяно быстрым предфильтром без полной оценки
  error?: string;
}

/** Действительная оценка из кэша для вакансии (если резюме с тех пор не менялось) */
export function cachedVerdict(job: Pick<Job, "title" | "company">): AiVerdict | undefined {
  const ai = getCachedAi(aiCacheKey(job));
  return ai && ai.profileHash === profileHash(getSettings()) ? ai : undefined;
}

/**
 * Сохраняет оценку; если ИИ нашёл нарушение правила отсева — скрывает вакансию.
 * Избранное и отклики не трогаем: выбор пользователя важнее.
 */
export function applyVerdict(id: string, ai: AiVerdict) {
  const job = getJob(id);
  if (!job) return;
  const patch: Partial<Job> = { ai };
  if (ai.reject && job.status === "new") Object.assign(patch, { status: "hidden", hiddenBy: "ai" });
  // Правило больше не нарушается (например, после переоценки) — возвращаем скрытую ИИ вакансию
  if (!ai.reject && job.status === "hidden" && job.hiddenBy === "ai") Object.assign(patch, { status: "new", hiddenBy: undefined });
  updateJob(id, patch);
}

/** Применяет оценку ко всем вакансиям-дублям (та же вакансия с другой площадки) */
function applyEverywhere(key: string, ai: AiVerdict, results: Record<string, AiVerdict>) {
  for (const j of allJobs()) {
    if (aiCacheKey(j) === key) {
      applyVerdict(j.id, ai);
      results[j.id] = ai;
    }
  }
}

export async function analyzeIds(
  ids: string[],
  opts: { force?: boolean; onProgress?: (done: number) => void } = {},
): Promise<AnalyzeResult> {
  const s = getSettings();
  const res: AnalyzeResult = { results: {}, fromCache: 0, analyzed: 0, prescreened: 0 };
  const todo: Job[] = [];
  for (const id of ids) {
    const job = await enrichJob(id);
    if (!job) continue;
    const cached = opts.force ? undefined : cachedVerdict(job);
    if (cached) {
      applyVerdict(id, cached);
      res.results[id] = cached;
      res.fromCache++;
    } else todo.push(job);
  }
  opts.onProgress?.(res.fromCache);
  // Этап 1: быстрый предфильтр по правилам отсева (дёшево, по 10 вакансий за запрос)
  if (s.aiRejectRules.some((r) => r.trim()) && todo.length > 1) {
    const ph = profileHash(s);
    const passed: Job[] = [];
    for (let i = 0; i < todo.length; i += PRESCREEN_BATCH) {
      const batch = todo.slice(i, i + PRESCREEN_BATCH);
      try {
        const rejects = await prescreenJobs(batch, s);
        for (const job of batch) {
          const reject = rejects.get(job.id);
          if (!reject) {
            passed.push(job);
            continue;
          }
          const ai: AiVerdict = {
            score: 0,
            verdict: `Отсеяно правилом: ${reject.rule}`,
            summary: "",
            pros: [],
            cons: [],
            kz: "unclear",
            stack: [],
            model: "предфильтр",
            at: new Date().toISOString(),
            profileHash: ph,
            reject,
            quick: true,
          };
          const key = aiCacheKey(job);
          putCachedAi(key, ai);
          applyEverywhere(key, ai, res.results);
          res.prescreened++;
        }
      } catch {
        // Предфильтр не сработал — не страшно, эти вакансии пройдут полную проверку (она тоже применяет правила)
        passed.push(...batch);
      }
      opts.onProgress?.(res.fromCache + res.prescreened);
    }
    todo.splice(0, todo.length, ...passed);
  }

  // Этап 2: полная проверка оставшихся
  const retried = new Set<string>();
  for (let i = 0; i < todo.length; i += AI_BATCH) {
    const batch = todo.slice(i, i + AI_BATCH);
    try {
      const map = await analyzeJobs(batch, s);
      for (const job of batch) {
        const ai = map.get(job.id);
        if (!ai) {
          // Модель «потеряла» вакансию в пачке — отправим её ещё раз в конце очереди (один раз)
          if (!retried.has(job.id)) {
            retried.add(job.id);
            todo.push(job);
          }
          continue;
        }
        const key = aiCacheKey(job);
        putCachedAi(key, ai);
        applyEverywhere(key, ai, res.results);
        res.analyzed++;
      }
    } catch (e: any) {
      res.error = e.message;
      break; // лимит или ключ — дальше смысла нет
    }
    opts.onProgress?.(res.fromCache + res.prescreened + res.analyzed);
  }
  return res;
}
