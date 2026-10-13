"use client";

import { triggerScan } from "@/components/Header";
import { IconCheck, IconKey, IconLayers, IconSpark, IconTarget, IconWrench } from "@/components/icons";
import { Btn, ChipsInput, cx, inputCls, Segmented, Switch } from "@/components/ui";
import type { ProfileSuggestion } from "@/lib/ai";
import { Settings, SOURCE_LABELS, SourceId } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SOURCE_GROUPS: { title: string; items: { id: SourceId; note: string }[] }[] = [
  {
    title: "СНГ",
    items: [
      { id: "hh", note: "Публичные страницы hh.kz / hh.ru, без входа, с паузами" },
      { id: "habr", note: "Русскоязычные IT-вакансии с удалёнкой" },
      { id: "getmatch", note: "IT-вакансии с точными форматами и странами" },
      { id: "djinni", note: "Официальная RSS, много удалёнки для СНГ" },
    ],
  },
  {
    title: "Международные",
    items: [
      { id: "linkedin", note: "Гостевой поиск, без входа в аккаунт" },
      { id: "ats", note: "Напрямую с карьерных страниц компаний" },
      { id: "himalayas", note: "Точный список стран — лучший гео-фильтр" },
      { id: "remotive", note: "Удалёнка по миру, есть ограничения по странам" },
      { id: "weworkremotely", note: "Крупнейшая доска удалёнки" },
      { id: "jobicy", note: "Удалёнка, часто Европа и весь мир" },
      { id: "remoteok", note: "Последние ~100 вакансий, много стартапов" },
      { id: "workingnomads", note: "Свежие ~50 вакансий" },
      { id: "arbeitnow", note: "В основном Германия и ЕС" },
    ],
  },
  {
    title: "Web3 и крипто",
    items: [
      { id: "cryptojobslist", note: "Часто можно из любой страны" },
      { id: "cryptocurrencyjobs", note: "Небольшая, но аккуратная доска" },
    ],
  },
  { title: "Прочее", items: [{ id: "telegram", note: "Публичные каналы — по умолчанию выключено" }] },
];

const HH_AREAS = [
  ["40", "Казахстан"],
  ["113", "Россия"],
  ["16", "Беларусь"],
  ["97", "Узбекистан"],
] as const;

const SECTIONS = [
  { id: "resume", label: "Резюме и ИИ", icon: IconSpark },
  { id: "search", label: "Что ищем", icon: IconTarget },
  { id: "sources", label: "Площадки", icon: IconLayers },
  { id: "service", label: "Обслуживание", icon: IconWrench },
];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const [dirty, setDirty] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ProfileSuggestion | null>(null);
  const [section, setSection] = useState("resume");
  const [checks, setChecks] = useState<{ done: number; none: number; stale: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
    fetch("/api/models").then((r) => r.json()).then(setModels).catch(() => {});
    loadChecks();
  }, []);

  const loadChecks = () =>
    fetch("/api/jobs?geo=ok,maybe")
      .then((r) => r.json())
      .then((d) => setChecks(d.checks))
      .catch(() => {});

  // Подсветка текущего раздела в оглавлении
  const loaded = !!s;
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !loaded) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setSection(vis[0].target.id);
      },
      { root, rootMargin: "0px 0px -65% 0px" },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [loaded]);

  if (!s)
    return (
      <div className="max-w-3xl mx-auto p-10 space-y-4">
        <div className="skeleton h-8 w-1/3" />
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    );

  const up = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setDirty(true);
  };

  const save = async () => {
    setSaved("saving");
    const r = await fetch("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    setS(await r.json());
    setSaved("done");
    setDirty(false);
    loadChecks();
    setTimeout(() => setSaved("idle"), 2200);
  };

  const extract = async () => {
    setExtracting(true);
    setExtractError(null);
    setSuggestion(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        body: JSON.stringify({ profile: s.profile, openrouterKey: s.openrouterKey, aiModel: s.aiModel }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSuggestion(j);
      up({
        keywords: j.keywords,
        mustHave: j.mustHave,
        // Стоп-слова дополняем, а не заменяем: пользовательские важнее
        exclude: Array.from(new Set([...s.exclude, ...j.exclude])),
        seniority: j.seniority.length ? j.seniority : s.seniority,
        minSalaryUsd: j.minSalaryUsd || s.minSalaryUsd,
      });
    } catch (e: any) {
      setExtractError(e.message);
    } finally {
      setExtracting(false);
    }
  };

  const saveAndScan = async () => {
    await save();
    await triggerScan();
    router.push("/");
  };

  const cleanup = async (scope: string, msg: string) => {
    if (!confirm(msg)) return;
    const r = await (await fetch(`/api/jobs?scope=${scope}`, { method: "DELETE" })).json();
    alert(`Удалено вакансий: ${r.deleted}`);
  };

  const enabledCount = Object.values(s.sources).filter(Boolean).length;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto scroll-thin">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 flex gap-12">
        {/* Оглавление */}
        <nav className="hidden md:block w-44 shrink-0 sticky top-0 self-start pt-12">
          <p className="eyebrow mb-3">Настройки</p>
          <ul className="space-y-px">
            {SECTIONS.map(({ id, label, icon: I }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={cx(
                    "flex items-center gap-2.5 h-8 px-2 -mx-2 rounded-md text-[13px] transition-colors",
                    section === id ? "text-fg bg-raised font-medium" : "text-muted hover:text-fg",
                  )}
                >
                  <I size={14} className={section === id ? "text-accent" : ""} />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 min-w-0 pt-10 pb-32 space-y-16">
          <header>
            <h1 className="font-serif text-[36px] leading-none tracking-[-0.02em]">Настройки поиска</h1>
            <p className="text-[13.5px] text-muted mt-3 max-w-xl leading-relaxed">
              Всё хранится локально в <code className="font-mono text-[12px] bg-raised px-1 rounded">data/db.json</code>. После
              сохранения рейтинг найденных вакансий пересчитывается.
            </p>
          </header>

          {/* ── Резюме и ИИ ── */}
          <Section id="resume" n="01" title="Резюме и ИИ" lead="ИИ использует резюме дважды: чтобы настроить поиск и чтобы оценить каждую вакансию.">
            <Field label="Резюме" hint="Целиком: опыт, стек, языки, ожидания по деньгам, что не интересно.">
              <textarea
                value={s.profile}
                onChange={(e) => up({ profile: e.target.value })}
                rows={11}
                placeholder={"Frontend-разработчик, 3 года. React, TypeScript, Next.js. Английский B2.\nХочу продуктовую компанию, от $2000. Не интересны: гемблинг, 1С."}
                className="w-full rounded-xl border border-line-strong/80 bg-panel px-4 py-3 text-[13.5px] leading-relaxed outline-none focus:border-fg-2 transition-colors placeholder:text-faint resize-y"
              />
              <p className="text-[11.5px] text-faint num mt-1">
                {s.profile.trim() ? `${s.profile.trim().split(/\s+/).length} слов` : "пусто"}
              </p>
            </Field>

            <div className="rounded-xl bg-raised/60 border border-line p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-[13.5px] font-medium">Настроить поиск по резюме</p>
                <p className="text-[12.5px] text-muted mt-0.5">
                  ИИ заполнит ключевые слова, стоп-слова, уровень и зарплату. Ничего не сохранится без вашего подтверждения.
                </p>
              </div>
              <Btn variant="primary" onClick={extract} disabled={extracting || !s.profile.trim()} className="h-9 shrink-0">
                <IconSpark size={14} className={cx(extracting && "animate-pulse")} />
                {extracting ? "Читаю резюме…" : "Заполнить"}
              </Btn>
            </div>
            {extracting && <p className="text-[12.5px] text-muted -mt-2">Бесплатные модели отвечают до минуты.</p>}
            {extractError && <p className="text-[13px] text-bad bg-bad-soft rounded-lg px-3 py-2 break-words">{extractError}</p>}
            {suggestion && (
              <div className="rounded-xl border border-good/30 bg-good-soft/50 p-4 space-y-2 animate-fade-in">
                <p className="flex items-center gap-2 text-[13.5px] font-medium text-good">
                  <IconCheck size={14} /> Поля заполнены — проверьте раздел «Что ищем»
                </p>
                {suggestion.note && <p className="font-serif italic text-[15px] text-fg-2">«{suggestion.note}»</p>}
                {suggestion.roles.length > 0 && (
                  <p className="text-[12.5px] text-muted">Подходящие роли: {suggestion.roles.join(" · ")}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Btn variant="primary" onClick={saveAndScan} disabled={saved === "saving"}>
                    Сохранить и сканировать
                  </Btn>
                  <Btn onClick={() => document.getElementById("search")?.scrollIntoView({ behavior: "smooth" })}>Проверить поля</Btn>
                </div>
              </div>
            )}

            <ProviderSettings s={s} up={up} models={models} />
            <Field
              label="Проверять ИИ сразу после скана"
              hint="Сколько лучших новых вакансий ИИ проверит автоматически после каждого скана. Остальные — кнопкой «Проверить ИИ» в списке."
            >
              <Segmented
                value={String(s.aiAutoTop)}
                onChange={(v) => up({ aiAutoTop: Number(v) })}
                options={["0", "5", "10", "20", "30"].map((v) => ({ value: v, label: v === "0" ? "Выкл" : v }))}
              />
            </Field>
            <Field
              label="Правила отсева"
              hint="Пишите своими словами. Применяются при проверке ИИ на любом языке вакансии: нарушителя скрывает, только если нашёл в тексте явное подтверждение (сохраняется цитатой). Избранное и отклики не скрываются. Без проверки ИИ правила не работают — для мгновенного отсева по точному слову есть «Исключить» ниже."
            >
              <RulesEditor value={s.aiRejectRules} onChange={(v) => up({ aiRejectRules: v })} />
            </Field>
            {checks && (
              <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] rounded-lg bg-raised/60 px-3 py-2">
                <span className="text-fg-2">
                  Сейчас ИИ проверил <span className="num text-fg">{checks.done}</span> из{" "}
                  <span className="num">{checks.done + checks.none + checks.stale}</span> вакансий
                </span>
                {checks.stale > 0 && <span className="text-warn">{checks.stale} проверок устарели</span>}
                {dirty && <span className="text-muted">Изменения резюме, ключевых слов или правил после сохранения сделают текущие проверки устаревшими</span>}
              </div>
            )}
          </Section>

          {/* ── Что ищем ── */}
          <Section id="search" n="02" title="Что ищем" lead="По ключевым словам идёт поиск на площадках и считается соответствие.">
            <Field label="Ключевые слова" hint="Стек и роли на английском. Enter — добавить. Первые 6 уходят в поиск на площадках.">
              <ChipsInput value={s.keywords} onChange={(v) => up({ keywords: v })} placeholder="react, typescript, frontend…" />
            </Field>
            <Field label="Обязательно хотя бы одно из" hint="Если ни одного нет в вакансии — сильный штраф к рейтингу.">
              <ChipsInput value={s.mustHave} onChange={(v) => up({ mustHave: v })} placeholder="typescript" />
            </Field>
            <Field label="Исключить" hint="Вакансии с этими словами вообще не попадут в базу.">
              <ChipsInput value={s.exclude} onChange={(v) => up({ exclude: v })} placeholder="php, wordpress…" tone="negative" />
            </Field>
            <Field label="Уровень">
              <div className="flex flex-wrap gap-1.5">
                {["intern", "junior", "middle", "senior", "lead"].map((l) => {
                  const on = s.seniority.includes(l);
                  return (
                    <button
                      key={l}
                      onClick={() => up({ seniority: on ? s.seniority.filter((x) => x !== l) : [...s.seniority, l] })}
                      className={cx(
                        "h-8 px-3 rounded-lg text-[13px] border capitalize transition-colors",
                        on ? "bg-fg text-bg border-fg" : "border-line-strong/80 text-fg-2 hover:border-faint",
                      )}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-5">
              <Field label="Зарплата от, $/мес" hint="Отсекает только вакансии с указанной зарплатой ниже.">
                <NumInput value={s.minSalaryUsd} onChange={(v) => up({ minSalaryUsd: v })} prefix="$" />
              </Field>
              <Field label="Не старше, дней" hint="0 — без ограничения">
                <NumInput value={s.maxAgeDays} onChange={(v) => up({ maxAgeDays: v })} />
              </Field>
            </div>
            <Switch
              checked={s.hideGeoRestricted}
              onChange={(v) => up({ hideGeoRestricted: v })}
              label="Скрывать вакансии, недоступные из Казахстана"
              hint="Только US, UK или конкретные страны, требование гражданства или разрешения на работу."
            />
          </Section>

          {/* ── Площадки ── */}
          <Section
            id="sources"
            n="03"
            title="Площадки"
            lead={`Включено ${enabledCount} из ${Object.keys(SOURCE_LABELS).length}. Сайты без API читаются как обычный браузер: без входа, по одному запросу с паузой.`}
          >
            {SOURCE_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="eyebrow mb-2.5">{g.title}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {g.items.map(({ id, note }) => {
                    const on = s.sources[id];
                    return (
                      <button
                        key={id}
                        onClick={() => up({ sources: { ...s.sources, [id]: !on } })}
                        aria-pressed={on}
                        className={cx(
                          "text-left flex items-start gap-3 p-3 rounded-xl border transition-colors",
                          on ? "border-line-strong bg-panel" : "border-line bg-transparent opacity-70 hover:opacity-100",
                        )}
                      >
                        <span
                          className={cx(
                            "mt-0.5 size-4 rounded grid place-items-center shrink-0 border transition-colors",
                            on ? "bg-fg border-fg text-bg" : "border-line-strong",
                          )}
                        >
                          {on && <IconCheck size={11} strokeWidth={2.2} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-medium">{SOURCE_LABELS[id]}</span>
                          <span className="block text-[12px] text-muted mt-0.5 leading-snug">{note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="space-y-6 pt-2">
              <Field label="hh — страны" hint="Удалёнка в выбранных странах.">
                <div className="flex flex-wrap gap-1.5">
                  {HH_AREAS.map(([id, label]) => {
                    const on = s.hhAreas.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => up({ hhAreas: on ? s.hhAreas.filter((x) => x !== id) : [...s.hhAreas, id] })}
                        className={cx(
                          "h-8 px-3 rounded-lg text-[13px] border transition-colors",
                          on ? "bg-fg text-bg border-fg" : "border-line-strong/80 text-fg-2 hover:border-faint",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="LinkedIn — локации" hint="Каждая локация × ключевое слово — отдельный запрос.">
                <ChipsInput value={s.linkedinLocations} onChange={(v) => up({ linkedinLocations: v })} placeholder="Kazakhstan, Worldwide" />
              </Field>
              <Field
                label="Сайты компаний"
                hint={
                  <>
                    Формат <code className="font-mono">ats:slug</code> — slug из адреса карьерной страницы: boards.greenhouse.io/
                    <b>gitlab</b>, jobs.lever.co/<b>toptal</b>, jobs.ashbyhq.com/<b>linear</b>.
                  </>
                }
              >
                <ChipsInput value={s.atsCompanies} onChange={(v) => up({ atsCompanies: v })} placeholder="ashby:linear" />
                <DiscoverCompanies
                  known={s.atsCompanies}
                  onAdd={(ids) => up({ atsCompanies: Array.from(new Set([...s.atsCompanies, ...ids])) })}
                />
              </Field>
              {s.sources.telegram && (
                <Field label="Telegram-каналы" hint="Имена публичных каналов без @.">
                  <ChipsInput value={s.telegramChannels} onChange={(v) => up({ telegramChannels: v })} placeholder="remote_it_jobs" />
                </Field>
              )}
            </div>
          </Section>

          {/* ── Обслуживание ── */}
          <Section id="service" n="04" title="Обслуживание" lead="Чистка базы. Избранное и отклики трогает только полная очистка.">
            <div className="divide-y divide-line rounded-xl border border-line bg-panel">
              {[
                ["stale", "Удалить устаревшие", "Новые вакансии, которые не встречались больше 30 дней.", "Удалить устаревшие вакансии?"],
                ["hidden", "Удалить скрытые", "Всё, что вы скрыли.", "Удалить все скрытые вакансии?"],
                ["all", "Очистить базу", "Все вакансии, включая избранное. Настройки и кэш ИИ останутся.", "Удалить ВСЕ вакансии?"],
              ].map(([scope, title, desc, confirmMsg]) => (
                <div key={scope} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex-1">
                    <p className={cx("text-[13.5px] font-medium", scope === "all" && "text-bad")}>{title}</p>
                    <p className="text-[12.5px] text-muted mt-0.5">{desc}</p>
                  </div>
                  <Btn size="sm" onClick={() => cleanup(scope, confirmMsg)} className={cx(scope === "all" && "!text-bad")}>
                    {scope === "all" ? "Очистить" : "Удалить"}
                  </Btn>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Панель сохранения */}
      <div
        className={cx(
          "fixed bottom-5 left-1/2 -translate-x-1/2 z-30 transition-all duration-200",
          dirty || saved !== "idle" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-4 pl-4 pr-1.5 h-12 rounded-xl bg-fg text-bg shadow-[var(--shadow-pop)]">
          <span className="text-[13px] whitespace-nowrap">
            {saved === "done" ? (
              <span className="flex items-center gap-1.5">
                <IconCheck size={14} /> Сохранено
              </span>
            ) : (
              "Есть несохранённые изменения"
            )}
          </span>
          {saved !== "done" && (
            <button
              onClick={save}
              disabled={saved === "saving"}
              className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[13px] font-medium hover:brightness-95 disabled:opacity-60"
            >
              {saved === "saving" ? "Сохраняю…" : "Сохранить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ id, n, title, lead, children }: { id: string; n: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="flex items-baseline gap-3 pb-4 mb-7 border-b border-line">
        <span className="num text-[12px] text-accent">{n}</span>
        <div>
          <h2 className="font-serif text-[24px] leading-none tracking-[-0.01em]">{title}</h2>
          {lead && <p className="text-[13px] text-muted mt-2 leading-relaxed max-w-xl">{lead}</p>}
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-fg mb-2">{label}</div>
      {children}
      {hint && <p className="text-[12px] text-muted mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function NumInput({ value, onChange, prefix }: { value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint num text-[13px]">{prefix}</span>}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={cx(inputCls, "num", prefix && "pl-7")}
      />
    </div>
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <IconKey size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={cx(inputCls, "pl-9 pr-20 font-mono text-[12.5px]")}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded text-[11.5px] text-muted hover:text-fg hover:bg-raised"
      >
        {show ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
}

const RULE_EXAMPLES = [
  "Требуется 3 года опыта и больше",
  "Нужно знание немецкого или другого языка, кроме русского и английского",
  "Работа только для граждан или резидентов определённой страны",
  "Обязателен офис или гибрид хотя бы пару дней в неделю",
  "Стек в основном PHP, WordPress или 1С",
  "Оплата только за процент от продаж или без фиксированной ставки",
];

function RulesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (r: string) => {
    const t = r.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  };
  const unused = RULE_EXAMPLES.filter((e) => !value.includes(e));
  return (
    <div className="rounded-xl border border-line-strong/80 bg-panel overflow-hidden">
      {value.length > 0 && (
        <ol className="divide-y divide-line">
          {value.map((r, i) => (
            <li key={r} className="flex items-start gap-3 px-4 py-2.5 group">
              <span className="num text-[11.5px] text-bad pt-[3px] w-4">{i + 1}</span>
              <span className="flex-1 text-[13.5px] leading-snug text-fg pt-px">{r}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== r))}
                className="text-[12px] text-faint hover:text-bad opacity-60 group-hover:opacity-100"
                aria-label={`Удалить правило ${i + 1}`}
              >
                Удалить
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className={cx("flex gap-2 p-2", value.length > 0 && "border-t border-line bg-bg/40")}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder="Например: требуется больше 3 лет опыта"
          className="flex-1 min-w-0 h-8 bg-transparent px-2 text-[13px] outline-none placeholder:text-faint"
        />
        <Btn size="sm" onClick={() => add(text)} disabled={!text.trim()}>
          Добавить
        </Btn>
      </div>
      {unused.length > 0 && (
        <div className="px-4 pb-3 pt-1">
          <p className="eyebrow mb-2">Примеры</p>
          <div className="flex flex-wrap gap-1.5">
            {unused.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => add(e)}
                className="text-[12px] text-muted border border-dashed border-line-strong rounded-md px-2 h-6 hover:text-fg hover:border-faint"
              >
                + {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Провайдер ИИ ───────── */

const PRESETS: { label: string; url: string; model?: string }[] = [
  { label: "OpenAI", url: "https://api.openai.com/v1" },
  { label: "Anthropic", url: "https://api.anthropic.com/v1", model: "claude-haiku-5-5" },
  { label: "Groq", url: "https://api.groq.com/openai/v1" },
  { label: "DeepSeek", url: "https://api.deepseek.com/v1" },
  { label: "Ollama (локально)", url: "http://localhost:11434/v1" },
];

function ProviderSettings({
  s,
  up,
  models,
}: {
  s: Settings;
  up: (p: Partial<Settings>) => void;
  models: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-5 pt-2">
      <Field label="Провайдер ИИ">
        <Segmented
          value={s.aiProvider}
          onChange={(v) => up({ aiProvider: v })}
          options={[
            { value: "openrouter", label: "OpenRouter — бесплатно" },
            { value: "custom", label: "Свой API" },
          ]}
        />
      </Field>
      {s.aiProvider === "openrouter" ? (
        <div className="grid sm:grid-cols-2 gap-5">
          <Field
            label="Ключ OpenRouter"
            hint={
              <>
                Бесплатно на{" "}
                <a
                  className="underline decoration-accent underline-offset-2 text-fg-2"
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  openrouter.ai/keys
                </a>
              </>
            }
          >
            <SecretInput value={s.openrouterKey} onChange={(v) => up({ openrouterKey: v })} placeholder="sk-or-v1-…" />
          </Field>
          <Field label="Модель" hint="openrouter/free выбирает доступную сам. При ошибке пробуются запасные.">
            <select value={s.aiModel} onChange={(e) => up({ aiModel: e.target.value })} className={inputCls}>
              {!models.some((m) => m.id === s.aiModel) && <option value={s.aiModel}>{s.aiModel}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-line p-4 bg-panel">
          <div>
            <p className="eyebrow mb-2">Быстрая настройка</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => up({ aiBaseUrl: p.url, ...(p.model && !s.aiCustomModel ? { aiCustomModel: p.model } : {}) })}
                  className={cx(
                    "h-7 px-2.5 rounded-md text-[12.5px] border transition-colors",
                    s.aiBaseUrl === p.url ? "bg-fg text-bg border-fg" : "border-line-strong/80 text-fg-2 hover:border-faint",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Адрес API" hint="Любой OpenAI-совместимый эндпоинт — к нему добавится /chat/completions.">
            <input
              value={s.aiBaseUrl}
              onChange={(e) => up({ aiBaseUrl: e.target.value.trim() })}
              placeholder="https://api.openai.com/v1"
              className={cx(inputCls, "font-mono text-[12.5px]")}
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Ключ API" hint="Для Ollama не нужен.">
              <SecretInput value={s.aiApiKey} onChange={(v) => up({ aiApiKey: v })} placeholder="sk-…" />
            </Field>
            <Field label="Модель" hint="Точное имя модели у провайдера.">
              <input
                value={s.aiCustomModel}
                onChange={(e) => up({ aiCustomModel: e.target.value.trim() })}
                placeholder="claude-haiku-5-5"
                className={cx(inputCls, "font-mono text-[12.5px]")}
              />
            </Field>
          </div>
          <p className="text-[12px] text-muted leading-snug">
            Платные API отвечают быстрее и стабильнее бесплатных. Ключ хранится только локально в data/db.json.
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────── Автопоиск компаний ───────── */

interface Found {
  id: string;
  name: string;
  remote: number;
  sample: string[];
  matched: number;
  from: "link" | "name";
}

function DiscoverCompanies({ known, onAdd }: { known: string[]; onAdd: (ids: string[]) => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [found, setFound] = useState<Found[]>([]);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setState("busy");
    setError(null);
    try {
      const r = await fetch("/api/discover", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setFound(j.companies);
      setState("done");
    } catch (e: any) {
      setError(e.message);
      setState("idle");
    }
  };
  const fresh = found.filter((c) => !known.includes(c.id));
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line-strong p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48">
          <p className="text-[13.5px] font-medium">Найти новые компании</p>
          <p className="text-[12.5px] text-muted mt-0.5 leading-snug">
            По ссылкам в собранных вакансиях и по компаниям из ваших лучших совпадений. Каждую проверяем через официальный API и
            предлагаем только тех, у кого сейчас открыта удалёнка.
          </p>
        </div>
        <Btn onClick={run} disabled={state === "busy"}>
          {state === "busy" ? "Ищу… до пары минут" : state === "done" ? "Искать снова" : "Найти"}
        </Btn>
      </div>
      {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
      {state === "done" && (
        <div className="mt-4">
          {fresh.length === 0 ? (
            <p className="text-[13px] text-muted">
              Новых компаний с открытой удалёнкой не нашлось. После следующего скана появятся новые ссылки.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="eyebrow">Найдено {fresh.length}</span>
                <button
                  type="button"
                  onClick={() => onAdd(fresh.map((c) => c.id))}
                  className="text-[12.5px] text-fg underline decoration-accent underline-offset-2"
                >
                  Добавить все
                </button>
              </div>
              <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
                {fresh.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium">
                        {c.name} <span className="font-mono text-[11.5px] text-faint font-normal">{c.id}</span>
                      </p>
                      <p className="text-[12px] text-muted mt-0.5 truncate">
                        <span className="num">{c.remote}</span> удалённых
                        {c.matched > 0 && (
                          <>
                            {" "}
                            · <span className="text-good num">{c.matched}</span> по вашим словам
                          </>
                        )}{" "}
                        · {c.sample.join(" · ")}
                      </p>
                    </div>
                    <Btn size="sm" onClick={() => onAdd([c.id])}>
                      Добавить
                    </Btn>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
