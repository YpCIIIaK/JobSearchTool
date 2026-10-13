"use client";

import { Job, JobStatus, ScanProgress, SOURCE_LABELS, SourceId } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, cx, GeoBadge, Logo, ScoreBadge, timeAgo } from "./ui";

type ListJob = Omit<Job, "description"> & { rank: number };
interface ListResp {
  total: number;
  counts: Record<JobStatus | "total", number>;
  sources: Record<string, number>;
  jobs: ListJob[];
}

const STATUS_TABS: { id: string; label: string; key?: JobStatus }[] = [
  { id: "active", label: "Все" },
  { id: "new", label: "Новые", key: "new" },
  { id: "saved", label: "Избранное", key: "saved" },
  { id: "applied", label: "Откликнулся", key: "applied" },
  { id: "hidden", label: "Скрытые", key: "hidden" },
];

export default function JobsView() {
  const [filters, setFilters] = useState({
    q: "",
    status: "active",
    source: "",
    geo: "ok,maybe",
    minScore: 0,
    sort: "rank",
    ai: false,
    salary: false,
  });
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Job | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    const p = new URLSearchParams({
      q: filters.q,
      status: filters.status,
      source: filters.source,
      geo: filters.geo,
      minScore: String(filters.minScore),
      sort: filters.sort,
      ai: filters.ai ? "1" : "",
      salary: filters.salary ? "1" : "",
    });
    const r = await fetch(`/api/jobs?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  // Прогресс скана: поллим, пока идёт
  const pollProgress = useCallback(async () => {
    const p: ScanProgress = await (await fetch("/api/scan")).json();
    setProgress(p);
    return p;
  }, []);
  useEffect(() => {
    pollProgress();
  }, [pollProgress]);
  useEffect(() => {
    if (!progress?.running) return;
    const t = setInterval(async () => {
      const p = await pollProgress();
      load();
      if (!p.running) clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [progress?.running, pollProgress, load]);

  const startScan = async () => {
    const r = await (await fetch("/api/scan", { method: "POST" })).json();
    setProgress(r.progress);
  };

  // Детали выбранной
  useEffect(() => {
    if (!selected) return setDetail(null);
    let cancel = false;
    fetch(`/api/jobs/${selected}`)
      .then((r) => r.json())
      .then((j) => !cancel && setDetail(j));
    return () => {
      cancel = true;
    };
  }, [selected]);

  const jobs = data?.jobs ?? [];

  const patchLocal = (id: string, patch: Partial<Job>) => {
    setData((d) => d && { ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
    setDetail((d) => (d && d.id === id ? { ...d, ...patch } : d));
  };

  const setStatus = async (id: string, status: JobStatus) => {
    const job = jobs.find((j) => j.id === id);
    const next = job?.status === status ? "new" : status;
    await fetch(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    patchLocal(id, { status: next });
    // Скрытая уходит из списка — выделяем следующую
    if (next === "hidden" && filters.status !== "hidden") {
      const idx = jobs.findIndex((j) => j.id === id);
      const following = jobs[idx + 1] ?? jobs[idx - 1];
      setData((d) => d && { ...d, jobs: d.jobs.filter((j) => j.id !== id), total: d.total - 1 });
      setSelected(following?.id ?? null);
    }
  };

  /** Отправляет пачку вакансий (до 5 за один запрос к модели) и раскладывает оценки по списку */
  const analyzeMany = async (ids: string[], force = false): Promise<boolean> => {
    setAnalyzing((s) => new Set([...s, ...ids]));
    try {
      const r = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ ids, force }) });
      const j: { results?: Record<string, Job["ai"]>; error?: string; fromCache?: number } = await r.json();
      const results = j.results ?? {};
      for (const [id, ai] of Object.entries(results)) patchLocal(id, { ai });
      setData(
        (d) =>
          d && {
            ...d,
            jobs: d.jobs.map((x) => {
              const ai = results[x.id];
              return ai ? { ...x, ai, rank: Math.round(ai.score * 0.7 + x.score * 0.3) } : x;
            }),
          },
      );
      // Описание могло догрузиться во время анализа — обновим открытую карточку
      if (selected && ids.includes(selected)) fetch(`/api/jobs/${selected}`).then((r) => r.json()).then(setDetail);
      if (j.error) notify(`ИИ: ${j.error}`);
      return !j.error;
    } finally {
      setAnalyzing((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }
  };

  const analyze = (id: string) => analyzeMany([id], !!jobs.find((j) => j.id === id)?.ai);

  const analyzeTop = async (n: number) => {
    const targets = jobs.filter((j) => !j.ai).slice(0, n).map((j) => j.id);
    setBulk({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i += 5) {
      const ok = await analyzeMany(targets.slice(i, i + 5));
      setBulk({ done: Math.min(targets.length, i + 5), total: targets.length });
      if (!ok) break;
    }
    setBulk(null);
  };

  // Горячие клавиши
  const selIdx = useMemo(() => jobs.findIndex((j) => j.id === selected), [jobs, selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "arrowdown" || k === "k" || k === "arrowup") {
        e.preventDefault();
        const dir = k === "j" || k === "arrowdown" ? 1 : -1;
        const next = jobs[Math.max(0, Math.min(jobs.length - 1, selIdx + dir))];
        if (next) {
          setSelected(next.id);
          document.getElementById(`job-${next.id}`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (!selected) return;
      else if (k === "s") setStatus(selected, "saved");
      else if (k === "h") setStatus(selected, "hidden");
      else if (k === "a") analyze(selected);
      else if (k === "o") {
        const j = jobs[selIdx];
        if (j) window.open(j.url, "_blank");
      } else if (k === "escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const f = (patch: Partial<typeof filters>) => setFilters((x) => ({ ...x, ...patch }));
  const noData = !loading && data && data.counts.total === 0;

  return (
    <div className="h-full flex">
      {/* Фильтры */}
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto scroll-thin hidden lg:block">
        <div className="p-4 space-y-6">
          <ScanBox progress={progress} onScan={startScan} />

          <Section title="Сортировка">
            <select
              value={filters.sort}
              onChange={(e) => f({ sort: e.target.value })}
              className="w-full h-9 rounded-lg border border-line bg-panel px-2 text-sm"
            >
              <option value="rank">По соответствию</option>
              <option value="date">Сначала свежие</option>
              <option value="salary">По зарплате</option>
            </select>
          </Section>

          <Section title={`Мин. рейтинг: ${filters.minScore}`}>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={filters.minScore}
              onChange={(e) => f({ minScore: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
          </Section>

          <Section title="Работа из Казахстана">
            {[
              ["ok,maybe", "Подходит или неясно"],
              ["ok", "Только явно подходит"],
              ["", "Показать все"],
            ].map(([v, l]) => (
              <Radio key={v} checked={filters.geo === v} onChange={() => f({ geo: v })} label={l} />
            ))}
          </Section>

          <Section title="Дополнительно">
            <Check checked={filters.ai} onChange={(v) => f({ ai: v })} label="Только с ИИ-оценкой" />
            <Check checked={filters.salary} onChange={(v) => f({ salary: v })} label="Только с зарплатой" />
          </Section>

          <Section title="Площадки">
            <Radio checked={!filters.source} onChange={() => f({ source: "" })} label="Все" />
            {Object.entries(data?.sources ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([id, n]) => (
                <Radio
                  key={id}
                  checked={filters.source === id}
                  onChange={() => f({ source: id })}
                  label={SOURCE_LABELS[id as SourceId] ?? id}
                  count={n}
                />
              ))}
          </Section>
        </div>
      </aside>

      {/* Список */}
      <section className={cx("flex-1 min-w-0 flex flex-col", selected && "hidden md:flex")}>
        <div className="p-3 border-b border-line bg-panel space-y-3">
          <div className="flex gap-2">
            <input
              value={filters.q}
              onChange={(e) => f({ q: e.target.value })}
              placeholder="Поиск по названию, компании, тегам…"
              className="flex-1 min-w-0 h-9 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
            />
            <Btn variant="outline" className="lg:hidden" onClick={startScan} disabled={progress?.running}>
              {progress?.running ? "Скан…" : "Скан"}
            </Btn>
            <Btn
              variant="outline"
              onClick={() => analyzeTop(10)}
              disabled={!!bulk || !jobs.some((j) => !j.ai)}
              title="Отправить в ИИ первые 10 вакансий без оценки"
            >
              {bulk ? `ИИ ${bulk.done}/${bulk.total}` : "✦ ИИ топ-10"}
            </Btn>
          </div>
          <div className="flex gap-1 overflow-x-auto scroll-thin">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => f({ status: t.id })}
                className={cx(
                  "px-3 h-8 rounded-md text-sm whitespace-nowrap",
                  filters.status === t.id ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-raised",
                )}
              >
                {t.label}
                {t.key && data ? <span className="ml-1.5 text-xs opacity-70">{data.counts[t.key]}</span> : null}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted self-center pl-3 whitespace-nowrap">
              {data ? `Найдено: ${data.total}` : ""}
            </span>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto scroll-thin">
          {noData ? (
            <Empty onScan={startScan} running={!!progress?.running} />
          ) : jobs.length === 0 && !loading ? (
            <p className="p-10 text-center text-muted text-sm">Ничего не найдено. Ослабьте фильтры или запустите скан.</p>
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <JobRow
                  key={j.id}
                  job={j}
                  active={j.id === selected}
                  analyzing={analyzing.has(j.id)}
                  onClick={() => setSelected(j.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Детали */}
      {selected && (
        <section className="w-full md:w-[52%] xl:w-[48%] shrink-0 border-l border-line bg-panel flex flex-col min-w-0">
          {detail ? (
            <Detail
              job={detail}
              analyzing={analyzing.has(detail.id)}
              onStatus={(s) => setStatus(detail.id, s)}
              onAnalyze={() => analyze(detail.id)}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="p-8 text-muted text-sm">Загрузка…</div>
          )}
        </section>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-xl bg-fg text-bg text-sm px-4 py-3 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Radio({ checked, onChange, label, count }: { checked: boolean; onChange: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onChange}
      className={cx(
        "w-full flex items-center justify-between text-left text-sm px-2 h-8 rounded-md",
        checked ? "bg-accent-soft text-accent font-medium" : "hover:bg-raised",
      )}
    >
      <span className="truncate">{label}</span>
      {count != null && <span className="text-xs opacity-70 tabular-nums">{count}</span>}
    </button>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm px-2 h-8 rounded-md hover:bg-raised cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

function ScanBox({ progress, onScan }: { progress: ScanProgress | null; onScan: () => void }) {
  const running = progress?.running;
  const entries = Object.entries(progress?.sources ?? {});
  return (
    <div className="rounded-xl border border-line p-3 space-y-3 bg-bg">
      <Btn variant="primary" className="w-full" onClick={onScan} disabled={running}>
        {running ? "Сканирую…" : "↻ Сканировать площадки"}
      </Btn>
      {progress && progress.phase !== "idle" && (
        <div className="text-xs space-y-1.5">
          <div className="flex justify-between text-muted">
            <span>
              {progress.phase}
              {progress.analyzeTotal ? ` ${progress.analyzed}/${progress.analyzeTotal}` : ""}
            </span>
            {!running && progress.finishedAt && <span>{timeAgo(progress.finishedAt)} назад</span>}
          </div>
          <div className="text-muted">
            Новых: <b className="text-fg">{progress.added}</b> · обновлено: {progress.updated}
          </div>
          <ul className="space-y-1">
            {entries.map(([id, s]) => (
              <li key={id} className="flex items-center gap-2" title={s.error}>
                <span
                  className={cx(
                    "size-1.5 rounded-full shrink-0",
                    s.state === "done" && "bg-good",
                    s.state === "error" && "bg-bad",
                    s.state === "running" && "bg-warn animate-pulse",
                    s.state === "pending" && "bg-line",
                  )}
                />
                <span className="truncate flex-1">{SOURCE_LABELS[id as SourceId] ?? id}</span>
                <span className={cx("tabular-nums", s.state === "error" ? "text-bad" : "text-muted")}>
                  {s.state === "error" ? "ошибка" : s.state === "done" ? s.count : "…"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function JobRow({ job, active, analyzing, onClick }: { job: ListJob; active: boolean; analyzing: boolean; onClick: () => void }) {
  return (
    <li
      id={`job-${job.id}`}
      onClick={onClick}
      className={cx(
        "flex gap-3 px-4 py-3.5 cursor-pointer border-l-2",
        active ? "bg-accent-soft border-accent" : "border-transparent hover:bg-raised",
      )}
    >
      <Logo src={job.companyLogo} name={job.company || job.title} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className={cx("font-medium leading-snug line-clamp-2", job.status === "new" && "font-semibold")}>{job.title}</h3>
          {job.status === "saved" && <span className="text-warn text-sm" title="В избранном">★</span>}
          {job.status === "applied" && <span className="text-good text-xs font-medium whitespace-nowrap">✓ отклик</span>}
        </div>
        <div className="text-sm text-muted mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
          {job.company && <span className="text-fg/80">{job.company}</span>}
          <span className="truncate max-w-64">{job.location}</span>
          <span>· {job.sourceLabel}</span>
          <span>· {timeAgo(job.postedAt ?? job.firstSeenAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <GeoBadge geo={job.geo} />
          {(job.salary || job.ai?.salary) && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-raised font-medium">{job.salary || job.ai?.salary}</span>
          )}
          {job.matched.slice(0, 5).map((m) => (
            <span key={m} className="text-[11px] px-1.5 py-0.5 rounded bg-accent-soft text-accent">
              {m}
            </span>
          ))}
        </div>
        {job.ai && <p className="text-sm mt-2 text-fg/85 line-clamp-2">✦ {job.ai.verdict}</p>}
        {analyzing && <p className="text-xs mt-2 text-accent animate-pulse">ИИ анализирует…</p>}
      </div>
      <ScoreBadge value={job.rank} ai={!!job.ai} />
    </li>
  );
}

function Detail({
  job,
  analyzing,
  onStatus,
  onAnalyze,
  onClose,
}: {
  job: Job;
  analyzing: boolean;
  onStatus: (s: JobStatus) => void;
  onAnalyze: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => scrollRef.current?.scrollTo(0, 0), [job.id]);
  const ai = job.ai;
  return (
    <>
      <div className="p-5 border-b border-line space-y-4">
        <div className="flex items-start gap-3">
          <button onClick={onClose} className="md:hidden -ml-1 mr-1 text-muted text-xl" aria-label="Назад">
            ←
          </button>
          <Logo src={job.companyLogo} name={job.company || job.title} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
            <p className="text-sm text-muted mt-0.5">
              {job.company || "Компания не указана"} · {job.location}
            </p>
          </div>
          <ScoreBadge value={ai ? Math.round(ai.score * 0.7 + job.score * 0.3) : job.score} ai={!!ai} size="lg" />
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <GeoBadge geo={job.geo} />
          {job.salary && <span className="px-1.5 py-0.5 rounded bg-raised font-medium">{job.salary}</span>}
          {job.employment && <span className="px-1.5 py-0.5 rounded bg-raised">{job.employment}</span>}
          <span className="px-1.5 py-0.5 rounded bg-raised">{job.sourceLabel}</span>
          <span className="px-1.5 py-0.5 rounded bg-raised">
            опубликовано {job.postedAt ? new Date(job.postedAt).toLocaleDateString("ru-RU") : "—"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-3 h-9 bg-accent text-accent-fg hover:opacity-90"
          >
            Открыть вакансию ↗
          </a>
          <Btn variant="outline" onClick={() => onStatus("saved")} className={cx(job.status === "saved" && "text-warn")}>
            {job.status === "saved" ? "★ В избранном" : "☆ В избранное"}
          </Btn>
          <Btn variant="outline" onClick={() => onStatus("applied")} className={cx(job.status === "applied" && "text-good")}>
            {job.status === "applied" ? "✓ Откликнулся" : "Откликнулся"}
          </Btn>
          <Btn variant="outline" onClick={() => onStatus("hidden")}>
            {job.status === "hidden" ? "Вернуть" : "Скрыть"}
          </Btn>
          <Btn variant="outline" onClick={onAnalyze} disabled={analyzing}>
            {analyzing ? "Анализ…" : ai ? "↻ Переоценить ИИ" : "✦ Оценить ИИ"}
          </Btn>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin p-5 space-y-6">
        {ai && (
          <div className="rounded-xl border border-line bg-bg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">✦ Оценка ИИ: {ai.score}/100</h3>
              <span
                className={cx(
                  "text-xs px-2 py-0.5 rounded font-medium",
                  ai.kz === "yes" ? "bg-good-soft text-good" : ai.kz === "no" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn",
                )}
              >
                {ai.kz === "yes" ? "Из КЗ можно" : ai.kz === "no" ? "Из КЗ нельзя" : "КЗ: неясно"}
              </span>
            </div>
            <p className="font-medium">{ai.verdict}</p>
            <p className="text-sm text-fg/85 leading-relaxed">{ai.summary}</p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              {ai.pros.length > 0 && (
                <ul className="space-y-1">
                  {ai.pros.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-good">+</span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {ai.cons.length > 0 && (
                <ul className="space-y-1">
                  {ai.cons.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-bad">−</span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {ai.stack.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ai.stack.map((s) => (
                  <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-raised">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted">
              {ai.model} · {timeAgo(ai.at)} назад
            </p>
          </div>
        )}

        {job.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.tags.slice(0, 20).map((t) => (
              <span
                key={t}
                className={cx(
                  "text-xs px-2 py-0.5 rounded-full border",
                  job.matched.some((m) => m.toLowerCase() === t.toLowerCase())
                    ? "border-accent text-accent"
                    : "border-line text-muted",
                )}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {job.description ? (
          <article className="prose-job" dangerouslySetInnerHTML={{ __html: job.description }} />
        ) : (
          <p className="text-muted text-sm">Описание недоступно — откройте вакансию по ссылке.</p>
        )}
      </div>
    </>
  );
}

function Empty({ onScan, running }: { onScan: () => void; running: boolean }) {
  return (
    <div className="max-w-md mx-auto text-center py-20 px-6 space-y-4">
      <div className="text-4xl">🔎</div>
      <h2 className="text-lg font-semibold">Пока пусто</h2>
      <p className="text-sm text-muted">
        Задайте ключевые слова и профиль в{" "}
        <Link href="/settings" className="text-accent underline">
          настройках
        </Link>
        , затем запустите сканирование — вакансии подтянутся с 9+ площадок.
      </p>
      <Btn variant="primary" onClick={onScan} disabled={running}>
        {running ? "Сканирую…" : "Сканировать сейчас"}
      </Btn>
    </div>
  );
}
