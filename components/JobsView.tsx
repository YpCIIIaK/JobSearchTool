"use client";

import { Job, JobStatus, ScanProgress, SOURCE_LABELS, SourceId } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCAN_EVENT, triggerScan } from "./Header";
import {
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconExternal,
  IconEyeOff,
  IconGlobe,
  IconMinus,
  IconPin,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSliders,
  IconSpark,
  IconStar,
  IconUndo,
  IconWallet,
  IconX,
} from "./icons";
import { Btn, cx, dayBucket, fmtDate, GeoTag, Logo, MatchMeter, Segmented, Switch, timeAgo } from "./ui";

type AiState = "none" | "done" | "stale";
type ListJob = Omit<Job, "description"> & { rank: number; aiState: AiState };
interface ListResp {
  total: number;
  counts: Record<JobStatus | "total", number>;
  sources: Record<string, number>;
  checks: Record<AiState, number>;
  jobs: ListJob[];
}
type Filters = {
  q: string;
  status: string;
  source: string;
  geo: string;
  minScore: number;
  sort: "rank" | "date" | "salary";
  check: "" | "done" | "todo";
  salary: boolean;
};

const STATUS_TABS: { id: string; label: string; key?: JobStatus }[] = [
  { id: "active", label: "Все" },
  { id: "new", label: "Новые", key: "new" },
  { id: "saved", label: "Избранное", key: "saved" },
  { id: "applied", label: "Отклики", key: "applied" },
  { id: "hidden", label: "Скрытые", key: "hidden" },
];

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

export default function JobsView() {
  const [filters, setFilters] = useState<Filters>({
    q: "",
    status: "active",
    source: "",
    geo: "ok,maybe",
    minScore: 0,
    sort: "rank",
    check: "",
    salary: false,
  });
  const [data, setData] = useState<ListResp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Прямая ссылка на вакансию: /?job=<id>; выбранная вакансия синхронизируется с адресом
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (id) setSelected(id);
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set("job", selected);
    else url.searchParams.delete("job");
    history.replaceState(null, "", url);
  }, [selected]);
  const [detail, setDetail] = useState<Job | null>(null);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: "error" } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const notify = (text: string, tone?: "error") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 6000);
  };

  const load = useCallback(async () => {
    const p = new URLSearchParams({
      q: filters.q,
      status: filters.status,
      source: filters.source,
      geo: filters.geo,
      minScore: String(filters.minScore),
      sort: filters.sort,
      check: filters.check,
      salary: filters.salary ? "1" : "",
    });
    const r = await fetch(`/api/jobs?${p}`);
    setData(await r.json());
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, filters.q ? 180 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  // Шапка сообщает о ходе скана — подтягиваем новые вакансии по мере поступления
  useEffect(() => {
    const onScan = (e: Event) => {
      const p = (e as CustomEvent).detail as ScanProgress | { started: true };
      if ("started" in p) return setScanning(true);
      setScanning(p.running);
      if (p.running || p.finishedAt) load();
    };
    window.addEventListener(SCAN_EVENT, onScan);
    return () => window.removeEventListener(SCAN_EVENT, onScan);
  }, [load]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    let cancel = false;
    setDetail(null);
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
    const job = jobs.find((j) => j.id === id) ?? (detail?.id === id ? detail : undefined);
    const next = job?.status === status ? "new" : status;
    await fetch(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    patchLocal(id, { status: next });
    setData((d) => {
      if (!d || !job) return d;
      const counts = { ...d.counts, [job.status]: d.counts[job.status] - 1, [next]: d.counts[next] + 1 };
      return { ...d, counts };
    });
    // Скрытая уходит из списка — выделяем следующую
    if (next === "hidden" && filters.status !== "hidden") {
      const idx = jobs.findIndex((j) => j.id === id);
      const following = jobs[idx + 1] ?? jobs[idx - 1];
      setData((d) => d && { ...d, jobs: d.jobs.filter((j) => j.id !== id), total: d.total - 1 });
      if (selected === id) setSelected(following?.id ?? null);
      notify("Вакансия скрыта");
    }
  };

  /** Отправляет пачку вакансий (до 5 за один запрос к модели) и раскладывает оценки по списку */
  const analyzeMany = async (ids: string[], force = false): Promise<boolean> => {
    setAnalyzing((s) => new Set([...s, ...ids]));
    try {
      const r = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ ids, force }) });
      const j: { results?: Record<string, Job["ai"]>; error?: string } = await r.json();
      const results = j.results ?? {};
      // Сервер скрывает новые вакансии, нарушившие правила отсева, — повторяем это локально
      const rejectedIds = new Set(
        Object.entries(results)
          .filter(([id, ai]) => ai?.reject && (jobs.find((x) => x.id === id)?.status ?? detail?.status) === "new")
          .map(([id]) => id),
      );
      for (const [id, ai] of Object.entries(results))
        patchLocal(id, rejectedIds.has(id) ? { ai, status: "hidden", hiddenBy: "ai" } : { ai });
      setData(
        (d) =>
          d && {
            ...d,
            total: d.total - (filters.status === "hidden" ? 0 : rejectedIds.size),
            jobs: d.jobs
              .filter((x) => filters.status === "hidden" || !rejectedIds.has(x.id) || x.id === selected)
              .map((x) => {
                const ai = results[x.id];
                return ai
                  ? { ...x, ai, aiState: "done" as const, rank: Math.round(ai.score * 0.7 + x.score * 0.3), ...(rejectedIds.has(x.id) ? { status: "hidden" as const, hiddenBy: "ai" as const } : {}) }
                  : x;
              }),
          },
      );
      if (rejectedIds.size)
        notify(
          `Отсеяно правилами: ${rejectedIds.size} ${plural(rejectedIds.size, "вакансия", "вакансии", "вакансий")} — они во вкладке «Скрытые»`,
        );
      // Описание могло догрузиться во время анализа — обновим открытую карточку
      if (selected && ids.includes(selected)) fetch(`/api/jobs/${selected}`).then((r) => r.json()).then(setDetail);
      if (j.error) notify(j.error, "error");
      return !j.error;
    } finally {
      setAnalyzing((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }
  };

  // Повторная проверка уже проверенной (актуальной) вакансии обходит кэш
  const analyze = (id: string) => analyzeMany([id], jobs.find((j) => j.id === id)?.aiState === "done");

  const analyzeTop = async (n: number) => {
    // Берём следующие по текущему порядку списка, ещё не проверенные или с устаревшей проверкой
    const targets = jobs.filter((j) => j.aiState !== "done").slice(0, n).map((j) => j.id);
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
      if ((e.target as HTMLElement).closest("input,textarea,select")) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (k === "j" || k === "arrowdown" || k === "k" || k === "arrowup") {
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

  const f = (patch: Partial<Filters>) => setFilters((x) => ({ ...x, ...patch }));
  const aiCount = jobs.filter((j) => j.ai).length;
  const activeFilters =
    (filters.source ? 1 : 0) + (filters.geo !== "ok,maybe" ? 1 : 0) + (filters.minScore ? 1 : 0) + (filters.check ? 1 : 0) + (filters.salary ? 1 : 0);

  // Группы по давности — только при сортировке по дате
  const groups = useMemo(() => {
    if (filters.sort !== "date") return [{ label: "", items: jobs }];
    const out: { label: string; items: ListJob[] }[] = [];
    for (const j of jobs) {
      const label = dayBucket(j.postedAt ?? j.firstSeenAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(j);
      else out.push({ label, items: [j] });
    }
    return out;
  }, [jobs, filters.sort]);

  const filterPanel = (
    <FilterPanel
      filters={filters}
      f={f}
      sources={data?.sources ?? {}}
      checks={data?.checks}
      onReset={() => f({ source: "", geo: "ok,maybe", minScore: 0, check: "", salary: false })}
      activeCount={activeFilters}
    />
  );

  return (
    <div className="h-full flex">
      <aside className="w-60 shrink-0 border-r border-line overflow-y-auto scroll-thin hidden lg:block">{filterPanel}</aside>

      {/* Список */}
      <section className={cx("flex-1 min-w-0 flex flex-col", selected && "hidden md:flex")}>
        <div className="px-4 sm:px-5 pt-4 pb-3 space-y-3 border-b border-line">
          <div className="flex gap-2">
            <label className="relative flex-1 min-w-0">
              <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                ref={searchRef}
                value={filters.q}
                onChange={(e) => f({ q: e.target.value })}
                placeholder="Должность, компания, технология"
                className="w-full h-9 rounded-lg border border-line-strong/80 bg-panel pl-9 pr-10 text-[13.5px] outline-none focus:border-fg-2 transition-colors placeholder:text-faint"
              />
              {filters.q ? (
                <button
                  onClick={() => f({ q: "" })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded text-muted hover:text-fg"
                  aria-label="Очистить поиск"
                >
                  <IconX size={13} />
                </button>
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:block">/</kbd>
              )}
            </label>
            <Btn className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Фильтры">
              <IconSliders size={14} />
              <span className="hidden sm:inline">Фильтры</span>
              {activeFilters > 0 && <span className="num text-accent">{activeFilters}</span>}
            </Btn>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex gap-0.5 overflow-x-auto scroll-thin max-w-full">
              {STATUS_TABS.map((t) => {
                const active = filters.status === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => f({ status: t.id })}
                    className={cx(
                      "h-7 px-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors",
                      active ? "text-fg font-medium bg-raised" : "text-muted hover:text-fg",
                    )}
                  >
                    {t.label}
                    {t.key && data ? <span className="num ml-1.5 text-[11.5px] text-faint">{data.counts[t.key]}</span> : null}
                  </button>
                );
              })}
            </div>
            <Segmented
              className="ml-auto shrink-0"
              value={filters.sort}
              onChange={(v) => f({ sort: v })}
              options={[
                { value: "rank", label: "Соответствие" },
                { value: "date", label: "Свежие" },
                { value: "salary", label: "Зарплата" },
              ]}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin">
          {data && data.counts.total > 0 && jobs.length > 0 && (
            <CheckSummary
              total={data.total}
              shown={jobs.length}
              checks={data.checks}
              bulk={bulk}
              onCheck={() => analyzeTop(10)}
              onFilter={(v) => f({ check: v })}
              filter={filters.check}
            />
          )}

          {!data ? (
            <ListSkeleton />
          ) : data.counts.total === 0 ? (
            <EmptyFirstRun scanning={scanning} />
          ) : jobs.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <p className="font-serif text-[22px]">Ничего не нашлось</p>
              <p className="text-[13px] text-muted mt-1.5">Ослабьте фильтры или измените запрос.</p>
              {activeFilters > 0 && (
                <Btn className="mt-4" onClick={() => f({ source: "", geo: "ok,maybe", minScore: 0, check: "", salary: false })}>
                  Сбросить фильтры
                </Btn>
              )}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label || "all"}>
                {g.label && (
                  <div className="sticky top-0 z-10 px-5 pt-4 pb-2 bg-bg/90 backdrop-blur flex items-baseline gap-2">
                    <span className="eyebrow">{g.label}</span>
                    <span className="num text-[11px] text-faint">{g.items.length}</span>
                  </div>
                )}
                <ul className="px-2 sm:px-3 pb-2">
                  {g.items.map((j) => (
                    <JobRow
                      key={j.id}
                      job={j}
                      active={j.id === selected}
                      analyzing={analyzing.has(j.id)}
                      onClick={() => setSelected(j.id)}
                      onStatus={(s) => setStatus(j.id, s)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Детали */}
      {selected && (
        <section className="w-full md:w-[54%] xl:w-[50%] shrink-0 border-l border-line bg-panel flex flex-col min-w-0 animate-slide-in">
          {detail && detail.id === selected ? (
            <Detail
              job={detail}
              stale={jobs.find((j) => j.id === detail.id)?.aiState === "stale"}
              analyzing={analyzing.has(detail.id)}
              onStatus={(s) => setStatus(detail.id, s)}
              onAnalyze={() => analyze(detail.id)}
              onClose={() => setSelected(null)}
            />
          ) : (
            <DetailSkeleton onClose={() => setSelected(null)} />
          )}
        </section>
      )}

      {/* Фильтры на мобильных */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-fg/30 animate-fade-in" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[86%] max-w-80 bg-panel shadow-[var(--shadow-pop)] overflow-y-auto animate-slide-in">
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="font-serif text-[20px]">Фильтры</span>
              <Btn variant="ghost" icon onClick={() => setDrawer(false)} aria-label="Закрыть">
                <IconX size={15} />
              </Btn>
            </div>
            {filterPanel}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[min(560px,calc(100vw-32px))] flex items-start gap-2.5",
            "rounded-xl px-4 py-3 text-[13px] shadow-[var(--shadow-pop)] animate-fade-in",
            toast.tone === "error" ? "bg-bad-soft text-bad border border-bad/20" : "bg-fg text-bg",
          )}
        >
          <span className="leading-snug break-words">{toast.text}</span>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 shrink-0 mt-0.5" aria-label="Закрыть">
            <IconX size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── Фильтры ───────── */

function FilterPanel({
  filters,
  f,
  sources,
  checks,
  onReset,
  activeCount,
}: {
  filters: Filters;
  f: (p: Partial<Filters>) => void;
  sources: Record<string, number>;
  checks?: Record<AiState, number>;
  onReset: () => void;
  activeCount: number;
}) {
  const sorted = Object.entries(sources).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...sorted.map(([, n]) => n));
  const total = sorted.reduce((a, [, n]) => a + n, 0);
  return (
    <div className="px-5 py-5 space-y-7">
      <FilterGroup title="Работа из Казахстана">
        {[
          ["ok,maybe", "Доступно или не указано"],
          ["ok", "Только явно доступно"],
          ["", "Все, включая ограниченные"],
        ].map(([v, l]) => (
          <Option key={v} checked={filters.geo === v} onClick={() => f({ geo: v })}>
            {l}
          </Option>
        ))}
      </FilterGroup>

      <FilterGroup
        title="Соответствие"
        aside={
          <span className="num text-[12px] text-fg-2">
            {filters.minScore ? `от ${filters.minScore}` : "любое"}
          </span>
        }
      >
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={filters.minScore}
          onChange={(e) => f({ minScore: Number(e.target.value) })}
          className="w-full accent-[var(--color-fg)] mt-1"
          aria-label="Минимальное соответствие"
        />
        <div className="flex justify-between num text-[10.5px] text-faint -mt-0.5">
          <span>0</span>
          <span>45</span>
          <span>90</span>
        </div>
      </FilterGroup>

      <FilterGroup title="Проверка ИИ">
        {(
          [
            ["", "Все вакансии"],
            ["done", "Проверены ИИ"],
            ["todo", "Не проверены"],
          ] as const
        ).map(([v, l]) => (
          <Option
            key={v}
            checked={filters.check === v}
            onClick={() => f({ check: v })}
            count={checks ? (v === "done" ? checks.done : v === "todo" ? checks.none + checks.stale : undefined) : undefined}
          >
            {l}
          </Option>
        ))}
      </FilterGroup>

      <FilterGroup title="Показывать">
        <div className="space-y-3 pt-1">
          <Switch checked={filters.salary} onChange={(v) => f({ salary: v })} label="Только с зарплатой" />
        </div>
      </FilterGroup>

      <FilterGroup title="Площадки" aside={<span className="num text-[11px] text-faint">{sorted.length}</span>}>
        <Option checked={!filters.source} onClick={() => f({ source: "" })} count={total}>
          Все площадки
        </Option>
        {sorted.map(([id, n]) => (
          <Option key={id} checked={filters.source === id} onClick={() => f({ source: id })} count={n} bar={n / max}>
            {SOURCE_LABELS[id as SourceId]?.replace(/ \(.*\)$/, "") ?? id}
          </Option>
        ))}
      </FilterGroup>

      {activeCount > 0 && (
        <button onClick={onReset} className="text-[12.5px] text-muted hover:text-fg flex items-center gap-1.5">
          <IconUndo size={13} /> Сбросить фильтры
        </button>
      )}
    </div>
  );
}

function FilterGroup({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function Option({
  checked,
  onClick,
  children,
  count,
  bar,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  bar?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "relative w-full flex items-center gap-2 text-left text-[13px] px-2 h-[30px] rounded-md -mx-2 transition-colors",
        checked ? "text-fg font-medium bg-raised" : "text-fg-2 hover:bg-raised/60",
      )}
      style={{ width: "calc(100% + 16px)" }}
    >
      <span className={cx("size-1.5 rounded-full shrink-0", checked ? "bg-accent" : "bg-transparent")} />
      <span className="truncate flex-1">{children}</span>
      {bar != null && (
        <span className="w-6 h-[3px] rounded-full bg-line overflow-hidden shrink-0">
          <span className="block h-full bg-faint" style={{ width: `${Math.max(6, bar * 100)}%` }} />
        </span>
      )}
      {count != null && <span className="num text-[11.5px] text-muted w-7 text-right">{count}</span>}
    </button>
  );
}

/* ───────── Строка списка ───────── */

function JobRow({
  job,
  active,
  analyzing,
  onClick,
  onStatus,
}: {
  job: ListJob;
  active: boolean;
  analyzing: boolean;
  onClick: () => void;
  onStatus: (s: JobStatus) => void;
}) {
  const salary = job.salary || job.ai?.salary;
  return (
    <li
      id={`job-${job.id}`}
      onClick={onClick}
      className={cx(
        "group relative flex gap-3.5 px-3 py-3.5 rounded-xl cursor-pointer transition-colors",
        active ? "bg-panel shadow-[0_0_0_1px_var(--color-line-strong)]" : "hover:bg-panel/70",
      )}
    >
      {active && <span className="absolute left-0 top-4 bottom-4 w-[2px] rounded-full bg-accent" />}
      <Logo src={job.companyLogo} name={job.company || job.title} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="text-[14.5px] font-medium leading-snug tracking-[-0.01em] line-clamp-2 text-fg">
            {job.title}
          </h3>
        </div>
        <p className="text-[13px] text-muted mt-0.5 truncate">
          <span className="text-fg-2">{job.company || "Компания не указана"}</span>
          <span className="text-faint"> · </span>
          {job.location.replace(/^Remote · |^Удалённо · /, "")}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <GeoTag geo={job.geo} compact />
          {salary && (
            <span className="flex items-center gap-1 text-[12px] text-fg-2">
              <IconWallet size={12} className="text-faint" />
              <span className="num">{salary}</span>
            </span>
          )}
          {job.status === "saved" && (
            <span className="flex items-center gap-1 text-[12px] text-warn">
              <IconStar size={12} filled /> В избранном
            </span>
          )}
          {job.status === "applied" && (
            <span className="flex items-center gap-1 text-[12px] text-good">
              <IconCheck size={12} /> Отклик
            </span>
          )}
          {job.aiState !== "done" && !analyzing && (
            <span
              className={cx("flex items-center gap-1 text-[11.5px]", job.aiState === "stale" ? "text-warn" : "text-faint")}
              title={
                job.aiState === "stale"
                  ? "Резюме или правила отсева изменились после проверки — оценка и отсев могут быть неактуальны"
                  : "ИИ ещё не проверял: нет оценки по резюме, правила отсева не применялись"
              }
            >
              <span className={cx("size-[7px] rounded-full border", job.aiState === "stale" ? "border-warn" : "border-faint")} />
              {job.aiState === "stale" ? "Проверка устарела" : "ИИ не проверял"}
            </span>
          )}
          <span className="text-[11.5px] text-faint num ml-auto sm:ml-0">
            {job.sourceLabel.replace(/ · (Greenhouse|Lever|Ashby)$/, "")} · {timeAgo(job.postedAt ?? job.firstSeenAt)}
          </span>
        </div>

        {job.matched.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {job.matched.slice(0, 6).map((m) => (
              <span key={m} className="font-mono text-[11px] px-1.5 h-5 leading-5 rounded bg-raised text-fg-2">
                {m}
              </span>
            ))}
          </div>
        )}

        {job.ai?.reject && job.status === "hidden" ? (
          <p className="mt-2.5 text-[12.5px] leading-snug text-bad flex gap-1.5">
            <IconEyeOff size={13} className="shrink-0 mt-px" />
            <span className="line-clamp-2">
              Отсеяно: {job.ai.reject.rule} — <span className="font-serif italic">«{job.ai.reject.quote}»</span>
            </span>
          </p>
        ) : (
          job.ai && (
            <p className="mt-2.5 text-[13.5px] leading-snug text-fg-2 font-serif italic line-clamp-2">«{job.ai.verdict}»</p>
          )
        )}
        {analyzing && (
          <p className="mt-2 text-[12px] text-accent flex items-center gap-1.5">
            <IconSpark size={12} className="animate-pulse" /> ИИ читает вакансию…
          </p>
        )}
      </div>

      <div className="flex flex-col items-end justify-between shrink-0">
        <MatchMeter value={job.rank} ai={!!job.ai} />
        {/* Быстрые действия при наведении */}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <QuickBtn
            label={job.status === "saved" ? "Убрать из избранного" : "В избранное"}
            onClick={() => onStatus("saved")}
            active={job.status === "saved"}
          >
            <IconStar size={13} filled={job.status === "saved"} />
          </QuickBtn>
          <QuickBtn label={job.status === "hidden" ? "Вернуть" : "Скрыть"} onClick={() => onStatus("hidden")}>
            {job.status === "hidden" ? <IconUndo size={13} /> : <IconEyeOff size={13} />}
          </QuickBtn>
        </div>
      </div>
    </li>
  );
}

function QuickBtn({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx("size-7 grid place-items-center rounded-md hover:bg-raised", active ? "text-warn" : "text-muted hover:text-fg")}
    >
      {children}
    </button>
  );
}

/* ───────── Детальная карточка ───────── */

/** Подсвечивает совпавшие навыки в тексте описания, не трогая HTML-теги */
function highlight(html: string, words: string[]): string {
  const ws = words.map((w) => w.trim()).filter((w) => w.length > 1);
  if (!ws.length) return html;
  const esc = ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\.|\s+|-/g, "[\\s.\\-]?"));
  const re = new RegExp(`(?<![\\p{L}\\d])(${esc.join("|")})(?![\\p{L}\\d])`, "giu");
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(re, "<mark>$1</mark>")))
    .join("");
}

function Detail({
  job,
  stale,
  analyzing,
  onStatus,
  onAnalyze,
  onClose,
}: {
  job: Job;
  stale?: boolean;
  analyzing: boolean;
  onStatus: (s: JobStatus) => void;
  onAnalyze: () => void;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => scrollRef.current?.scrollTo(0, 0), [job.id]);
  const ai = job.ai;
  const rank = ai ? Math.round(ai.score * 0.7 + job.score * 0.3) : job.score;
  const html = useMemo(() => highlight(job.description, job.matched), [job.description, job.matched]);
  const tags = job.tags.filter((t) => !t.startsWith("поиск: "));

  const facts = [
    { icon: IconWallet, label: "Зарплата", value: job.salary || ai?.salary || "Не указана", mono: !!(job.salary || ai?.salary) },
    { icon: IconPin, label: "Локация", value: job.location.replace(/^Remote · |^Удалённо · /, "") || "—" },
    { icon: IconGlobe, label: "Из Казахстана", value: <GeoTag geo={job.geo} /> },
    { icon: IconClock, label: "Опубликовано", value: fmtDate(job.postedAt ?? job.firstSeenAt) },
  ];

  return (
    <>
      <div className="flex items-center gap-1 px-3 sm:px-5 h-12 border-b border-line shrink-0">
        <Btn variant="ghost" size="sm" onClick={onClose} className="md:hidden -ml-1">
          <IconArrowLeft size={14} /> Назад
        </Btn>
        <span className="eyebrow hidden md:block truncate">
          {job.sourceLabel}
          {job.employment ? ` · ${job.employment}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Btn
            variant="ghost"
            size="sm"
            icon
            onClick={() => onStatus("saved")}
            title={job.status === "saved" ? "Убрать из избранного (S)" : "В избранное (S)"}
            className={cx(job.status === "saved" && "text-warn")}
          >
            <IconStar size={15} filled={job.status === "saved"} />
          </Btn>
          <Btn variant="ghost" size="sm" icon onClick={() => onStatus("hidden")} title={job.status === "hidden" ? "Вернуть" : "Скрыть (H)"}>
            {job.status === "hidden" ? <IconUndo size={15} /> : <IconEyeOff size={15} />}
          </Btn>
          <span className="w-px h-4 bg-line mx-1 hidden md:block" />
          <Btn variant="ghost" size="sm" icon onClick={onClose} title="Закрыть (Esc)" className="hidden md:inline-flex">
            <IconX size={15} />
          </Btn>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin">
        <div className="px-5 sm:px-8 pt-7 pb-6">
          <div className="flex items-start gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <Logo src={job.companyLogo} name={job.company || job.title} size={28} />
                <span className="text-[14px] text-fg-2 font-medium truncate">{job.company || "Компания не указана"}</span>
              </div>
              <h1 className="font-serif text-[27px] sm:text-[31px] leading-[1.12] tracking-[-0.015em] mt-3 text-balance">{job.title}</h1>
            </div>
            <MatchMeter value={rank} ai={!!ai} size="lg" />
          </div>

          <dl className="grid grid-cols-2 gap-px mt-6 rounded-xl overflow-hidden border border-line bg-line">
            {facts.map(({ icon: I, label, value, mono }) => (
              <div key={label} className="bg-panel px-3.5 py-3 min-w-0">
                <dt className="flex items-center gap-1.5 text-[11.5px] text-muted">
                  <I size={12} /> {label}
                </dt>
                <dd className={cx("mt-1 text-[13.5px] text-fg truncate", mono && "num")}>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2 mt-5">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13.5px] font-medium hover:brightness-95 transition"
            >
              Открыть вакансию <IconExternal size={14} />
            </a>
            <Btn
              className={cx("h-9", job.status === "applied" && "!border-good/40 !text-good")}
              onClick={() => onStatus("applied")}
            >
              <IconCheck size={14} /> {job.status === "applied" ? "Отклик отправлен" : "Я откликнулся"}
            </Btn>
          </div>
        </div>

        {ai?.reject && (
          <div className="px-5 sm:px-8 pb-5">
            <div className="rounded-xl border border-bad/25 bg-bad-soft/60 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <IconEyeOff size={15} className="text-bad shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-bad">
                    {job.status === "hidden" ? "Скрыто правилом отсева" : "Нарушает правило отсева"}: {ai.reject.rule}
                  </p>
                  <blockquote className="mt-1.5 text-[13.5px] text-fg-2 font-serif italic border-l-2 border-bad/30 pl-3">
                    «{ai.reject.quote}»
                  </blockquote>
                </div>
                {job.status === "hidden" && (
                  <Btn size="sm" onClick={() => onStatus("hidden")} className="shrink-0">
                    <IconUndo size={12} /> Вернуть
                  </Btn>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Заключение ИИ */}
        <div className="px-5 sm:px-8">
          {ai ? (
            <section className="rounded-2xl border border-line bg-bg/60 overflow-hidden">
              <header className="flex items-center gap-2 px-5 py-3 border-b border-line">
                <IconSpark size={13} className="text-accent" />
                <span className="eyebrow">Проверка ИИ</span>
                {stale && (
                  <span
                    className="text-[11px] text-warn bg-warn-soft rounded px-1.5 h-5 leading-5"
                    title="Резюме или правила отсева изменились после этой проверки"
                  >
                    устарела
                  </span>
                )}
                <span className="num text-[11px] text-faint ml-auto truncate max-w-[45%]" title={ai.model}>
                  {ai.model.split("/").pop()} · {timeAgo(ai.at)}
                </span>
              </header>
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="text-center shrink-0">
                    <div className={cx("num text-[34px] leading-none", ai.score >= 70 ? "text-good" : ai.score >= 45 ? "text-warn" : "text-muted")}>
                      {ai.score}
                    </div>
                    <div className="eyebrow mt-1 !text-[9.5px]">из 100</div>
                  </div>
                  <div className="min-w-0">
                    <p className="font-serif text-[19px] leading-snug text-fg">{ai.verdict}</p>
                    <KzVerdict kz={ai.kz} />
                  </div>
                </div>
                {ai.summary && <p className="text-[14px] leading-relaxed text-fg-2">{ai.summary}</p>}
                {(ai.pros.length > 0 || ai.cons.length > 0) && (
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 pt-1">
                    <ProsCons title="Подходит" items={ai.pros} tone="good" />
                    <ProsCons title="Смущает" items={ai.cons} tone="bad" />
                  </div>
                )}
                {ai.stack.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ai.stack.map((s) => (
                      <span key={s} className="font-mono text-[11.5px] px-1.5 h-5 leading-5 rounded bg-raised text-fg-2">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <footer className="px-5 py-2.5 border-t border-line flex justify-end">
                <Btn variant="quiet" size="sm" onClick={onAnalyze} disabled={analyzing}>
                  <IconRefresh size={12} className={cx(analyzing && "animate-spin")} />
                  {analyzing ? "Проверяю…" : stale ? "Проверить заново" : "Перепроверить"}
                </Btn>
              </footer>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-line-strong p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-[14px] font-medium text-fg">ИИ ещё не проверял эту вакансию</p>
                <p className="text-[13px] text-muted mt-0.5 leading-snug">
                  Проверка — это оценка по вашему резюме, доступность из Казахстана и ваши правила отсева. Пока её нет,
                  рейтинг считается только по ключевым словам.
                </p>
              </div>
              <Btn onClick={onAnalyze} disabled={analyzing} className="h-9 shrink-0">
                <IconSpark size={14} className={cx("text-accent", analyzing && "animate-pulse")} />
                {analyzing ? "Проверяю…" : "Проверить"}
                {!analyzing && <kbd className="ml-1">A</kbd>}
              </Btn>
            </section>
          )}
        </div>

        {/* Описание */}
        <div className="px-5 sm:px-8 pt-9 pb-14">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="eyebrow">Описание</h2>
            {job.matched.length > 0 && (
              <span className="text-[11.5px] text-muted">
                <mark className="bg-accent-soft text-fg rounded-sm px-1">выделено</mark> — совпадения с вашими навыками
              </span>
            )}
          </div>
          {job.description ? (
            <article className="prose-job" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-[14px] text-muted">
              Площадка не отдала текст описания.{" "}
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-fg underline decoration-accent underline-offset-2">
                Откройте оригинал
              </a>
              .
            </p>
          )}
          {tags.length > 0 && (
            <div className="mt-8 pt-5 border-t border-line">
              <h2 className="eyebrow mb-3">Теги площадки</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 24).map((t) => {
                  const hit = job.matched.some((m) => m.toLowerCase() === t.toLowerCase());
                  return (
                    <span
                      key={t}
                      className={cx(
                        "text-[12px] px-2 h-6 leading-6 rounded-md border",
                        hit ? "border-accent/50 text-fg bg-accent-soft" : "border-line text-muted",
                      )}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function KzVerdict({ kz }: { kz: "yes" | "no" | "unclear" }) {
  const m = {
    yes: ["text-good", "ИИ: из Казахстана можно"],
    no: ["text-bad", "ИИ: из Казахстана нельзя"],
    unclear: ["text-warn", "ИИ: доступность из КЗ неясна"],
  } as const;
  return <p className={cx("text-[12.5px] mt-1.5", m[kz][0])}>{m[kz][1]}</p>;
}

function ProsCons({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  if (!items.length) return null;
  const Icon = tone === "good" ? IconPlus : IconMinus;
  return (
    <div>
      <h4 className="eyebrow mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((p, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-fg-2">
            <Icon size={13} className={cx("shrink-0 mt-[3px]", tone === "good" ? "text-good" : "text-bad")} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── Состояния ───────── */

function ListSkeleton() {
  return (
    <ul className="px-3 py-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <li key={i} className="flex gap-3.5 px-3 py-4">
          <div className="skeleton size-9 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <div className="skeleton h-3 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
          <div className="skeleton w-8 h-5" />
        </li>
      ))}
    </ul>
  );
}

function DetailSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="flex items-center px-5 h-12 border-b border-line">
        <div className="skeleton h-3 w-40" />
        <Btn variant="ghost" size="sm" icon onClick={onClose} className="ml-auto" aria-label="Закрыть">
          <IconX size={15} />
        </Btn>
      </div>
      <div className="px-8 pt-7 space-y-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-8 w-4/5" />
        <div className="skeleton h-8 w-3/5" />
        <div className="skeleton h-28 w-full mt-6 rounded-xl" />
        <div className="space-y-2.5 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
          ))}
        </div>
      </div>
    </>
  );
}

function EmptyFirstRun({ scanning }: { scanning: boolean }) {
  const steps = [
    ["Вставьте резюме", "В настройках — ИИ сам подберёт ключевые слова, стоп-слова и уровень."],
    ["Запустите скан", "14 площадок: hh, LinkedIn, сайты компаний, доски удалёнки и web3."],
    ["Разберите лучшие", "Сортировка по соответствию, оценка ИИ, фильтр по доступности из КЗ."],
  ];
  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <p className="eyebrow">Первый запуск</p>
      <h2 className="font-serif text-[32px] leading-tight mt-2">Найдём удалёнку, на которую реально попасть из Казахстана</h2>
      <ol className="mt-8 space-y-5">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="num text-[13px] text-accent pt-0.5">0{i + 1}</span>
            <div>
              <p className="text-[14px] font-medium">{t}</p>
              <p className="text-[13px] text-muted mt-0.5 leading-snug">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex gap-2 mt-9">
        <Link
          href="/settings"
          className="inline-flex items-center h-9 px-4 rounded-lg bg-fg text-bg text-[13.5px] font-medium hover:bg-fg-2"
        >
          Открыть настройки
        </Link>
        <Btn className="h-9" onClick={triggerScan} disabled={scanning}>
          <IconRefresh size={14} className={cx(scanning && "animate-spin")} />
          {scanning ? "Сканирую…" : "Сканировать сразу"}
        </Btn>
      </div>
    </div>
  );
}

/* ───────── Сводка проверки ИИ ───────── */

function CheckSummary({
  total,
  shown,
  checks,
  bulk,
  onCheck,
  onFilter,
  filter,
}: {
  total: number;
  shown: number;
  checks: Record<AiState, number>;
  bulk: { done: number; total: number } | null;
  onCheck: () => void;
  onFilter: (v: Filters["check"]) => void;
  filter: Filters["check"];
}) {
  const all = checks.done + checks.none + checks.stale;
  const todo = checks.none + checks.stale;
  const pct = all ? (checks.done / all) * 100 : 0;
  const [help, setHelp] = useState(false);
  return (
    <div className="mx-4 sm:mx-5 mt-3 mb-1 rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-[13px]">
          <IconSpark size={13} className="text-accent" />
          <span className="text-fg-2">
            ИИ проверил{" "}
            <button onClick={() => onFilter(filter === "done" ? "" : "done")} className="num text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
              {checks.done}
            </button>{" "}
            из <span className="num">{all}</span>
          </span>
          {todo > 0 && (
            <>
              <span className="text-faint">·</span>
              <button onClick={() => onFilter(filter === "todo" ? "" : "todo")} className="text-muted hover:text-fg">
                <span className="num">{todo}</span> не проверены
                {checks.stale > 0 && <span className="text-warn"> (из них {checks.stale} устарели)</span>}
              </button>
            </>
          )}
          <button
            onClick={() => setHelp(!help)}
            className={cx("size-5 grid place-items-center rounded-full border text-[11px] ml-0.5", help ? "border-fg text-fg" : "border-line-strong text-muted hover:text-fg")}
            aria-label="Что такое проверка ИИ"
          >
            ?
          </button>
        </div>
        {todo > 0 && (
          <Btn size="sm" onClick={onCheck} disabled={!!bulk} className="ml-auto">
            {bulk ? (
              <>
                <IconSpark size={12} className="text-accent animate-pulse" />
                Проверяю <span className="num">{bulk.done}/{bulk.total}</span>
              </>
            ) : (
              <>Проверить следующие {Math.min(10, todo)}</>
            )}
          </Btn>
        )}
      </div>
      <div className="mt-2.5 h-[3px] rounded-full bg-raised overflow-hidden">
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {help && (
        <div className="mt-3 pt-3 border-t border-line grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] leading-snug text-muted animate-fade-in">
          <p>
            <b className="text-fg-2 font-medium">Без проверки</b> работают только ключевые слова, стоп-слова и гео-фильтр. Рейтинг — по
            совпадениям слов.
          </p>
          <p>
            <b className="text-fg-2 font-medium">Проверка ИИ</b> читает вакансию целиком: оценка по резюме, доступность из КЗ и ваши
            правила отсева. Нарушителей скрывает.
          </p>
          <p>
            <b className="text-fg-2 font-medium">Когда проверяется:</b> сразу после скана — лучшие новые (сколько — в настройках), остальные
            — этой кнопкой, по 5 за запрос.
          </p>
          <p>
            <b className="text-warn font-medium">Устарела</b> — вы изменили резюме, ключевые слова или правила после проверки. Нажмите
            «Проверить», чтобы обновить.
          </p>
        </div>
      )}
      {total > shown && <p className="mt-2 text-[11.5px] text-faint">Показаны первые {shown} из {total}</p>}
    </div>
  );
}
