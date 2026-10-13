import { analyzeIds, applyVerdict, cachedVerdict } from "./analyze";
import { rescore, salaryUsdMonth, scoreJob } from "./score";
import { SOURCES } from "./sources";
import { allJobs, getLastScan, getSettings, putJob, save, setLastScan, updateJob } from "./store";
import { Job, ScanProgress, SourceId } from "./types";
import { hash, normKey } from "./util";

const g = globalThis as unknown as { __jfScan?: ScanProgress };

export function getProgress(): ScanProgress {
  return (
    g.__jfScan ??
    getLastScan() ?? { running: false, phase: "idle", sources: {}, added: 0, updated: 0, analyzed: 0, analyzeTotal: 0 }
  );
}

export function startScan(): boolean {
  if (g.__jfScan?.running) return false;
  const s = getSettings();
  const enabled = (Object.keys(SOURCES) as SourceId[]).filter((id) => s.sources[id]);
  g.__jfScan = {
    running: true,
    startedAt: new Date().toISOString(),
    phase: "Сканирую площадки",
    sources: Object.fromEntries(enabled.map((id) => [id, { state: "pending", count: 0 }])),
    added: 0,
    updated: 0,
    analyzed: 0,
    analyzeTotal: 0,
  };
  run(enabled).catch((e) => {
    console.error("[scan]", e);
    const p = getProgress();
    p.phase = `Ошибка: ${e.message}`;
    p.running = false;
  });
  return true;
}

async function run(enabled: SourceId[]) {
  const p = g.__jfScan!;
  const s = getSettings();
  const now = new Date().toISOString();
  const maxAge = s.maxAgeDays > 0 ? Date.now() - s.maxAgeDays * 864e5 : 0;

  // Индекс существующих для дедупликации между площадками
  const existing = allJobs();
  const byId = new Map(existing.map((j) => [j.id, j]));
  const byKey = new Map(existing.map((j) => [normKey(j.title) + "|" + normKey(j.company), j]));
  const newIds: string[] = [];

  await Promise.all(
    enabled.map(async (id) => {
      p.sources[id].state = "running";
      try {
        const raws = await SOURCES[id](s);
        let kept = 0;
        for (const raw of raws) {
          if (!raw.url || !raw.title) continue;
          if (maxAge && raw.postedAt && new Date(raw.postedAt).getTime() < maxAge) continue;
          const r = scoreJob(raw, s);
          if (r.excluded) continue;
          if (s.keywords.some((k) => k.trim()) && r.matched.length === 0) continue;

          const jid = hash(raw.source + "|" + raw.url);
          const key = normKey(raw.title) + "|" + normKey(raw.company);
          const prev = byId.get(jid) ?? (raw.company ? byKey.get(key) : undefined);
          if (prev) {
            // Дубль: обновляем «видели», но не перетираем более богатое описание
            // Данные другой площадки не смешиваем: локация и гео остаются от первоисточника
            const same = prev.source === raw.source;
            updateJob(prev.id, {
              lastSeenAt: now,
              ...(same && raw.description.length > prev.description.length ? { description: raw.description } : {}),
              ...(same ? { score: r.score, matched: r.matched, geo: r.geo } : {}),
            });
            p.updated++;
            kept++;
            continue;
          }
          const job: Job = {
            ...raw,
            id: jid,
            geo: r.geo,
            score: r.score,
            matched: r.matched,
            salaryUsdMonth: salaryUsdMonth(raw.salary),
            status: "new",
            ai: undefined,
            firstSeenAt: now,
            lastSeenAt: now,
          };
          putJob(job);
          // Уже оценённая ранее вакансия (например, с другой площадки): берём оценку из кэша
          const cached = cachedVerdict(raw);
          if (cached) applyVerdict(jid, cached);
          byId.set(jid, job);
          byKey.set(key, job);
          newIds.push(jid);
          p.added++;
          kept++;
        }
        p.sources[id] = { state: "done", count: kept };
      } catch (e: any) {
        p.sources[id] = { state: "error", count: 0, error: String(e.message || e).slice(0, 300) };
      }
    }),
  );
  save(true);

  // Авто-анализ лучших новых вакансий
  if (s.aiAutoTop > 0 && s.openrouterKey) {
    const top = newIds
      .map((id) => byId.get(id)!)
      .filter((j) => j.geo !== "no")
      .sort((a, b) => b.score - a.score)
      .filter((j) => !j.ai)
      .slice(0, s.aiAutoTop);
    p.phase = "ИИ-анализ лучших";
    p.analyzeTotal = top.length;
    const r = await analyzeIds(top.map((j) => j.id), { onProgress: (n) => (p.analyzed = n) });
    if (r.error) console.warn("[ai]", r.error);
    save(true);
  }

  p.phase = "Готово";
  p.running = false;
  p.finishedAt = new Date().toISOString();
  setLastScan(p);
}

export function rescoreAll() {
  const s = getSettings();
  for (const j of allJobs()) {
    const r = rescore(j, s);
    updateJob(j.id, { score: r.score, matched: r.matched, geo: r.geo, salaryUsdMonth: r.salaryUsdMonth });
  }
  save(true);
}
