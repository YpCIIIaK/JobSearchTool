"use client";

import { Btn, ChipsInput, cx } from "@/components/ui";
import { Settings, SOURCE_LABELS, SourceId } from "@/lib/types";
import type { ProfileSuggestion } from "@/lib/ai";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SOURCE_NOTES: Record<SourceId, string> = {
  remotive: "Удалёнка по всему миру, есть фильтр по стране",
  remoteok: "Последние ~100 вакансий, много крипто/стартапов",
  himalayas: "Точные ограничения по странам — лучший гео-фильтр",
  jobicy: "Удалёнка, часто Европа/весь мир",
  arbeitnow: "В основном Германия/ЕС, берутся только remote",
  weworkremotely: "Крупнейшая доска удалёнки, RSS",
  workingnomads: "Свежие ~50 вакансий",
  habr: "Русскоязычные IT-вакансии с удалёнкой",
  hh: "Публичные страницы hh.kz / hh.ru, без входа",
  linkedin: "Гостевой поиск LinkedIn, без входа в аккаунт",
  ats: "Вакансии напрямую с карьерных страниц компаний",
  cryptojobslist: "Web3/крипто, часто можно из любой страны",
  cryptocurrencyjobs: "Web3/крипто, свежие ~50 вакансий",
  telegram: "Публичные каналы с вакансиями (список ниже)",
};

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const [dirty, setDirty] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ProfileSuggestion | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
    fetch("/api/models").then((r) => r.json()).then(setModels).catch(() => {});
  }, []);

  if (!s) return <div className="p-8 text-muted">Загрузка…</div>;

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
    setTimeout(() => setSaved("idle"), 2000);
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
    await fetch("/api/scan", { method: "POST" });
    router.push("/");
  };

  const cleanup = async (scope: string, msg: string) => {
    if (!confirm(msg)) return;
    const r = await (await fetch(`/api/jobs?scope=${scope}`, { method: "DELETE" })).json();
    alert(`Удалено: ${r.deleted}`);
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8 pb-28">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Настройки поиска</h1>
          <p className="text-muted text-sm mt-1">
            Всё хранится локально в <code>data/db.json</code>. После сохранения рейтинг уже найденных вакансий
            пересчитывается.
          </p>
        </div>

        <Card title="Резюме и ИИ (OpenRouter, бесплатные модели)">
          <Field
            label="API-ключ OpenRouter"
            hint={
              <>
                Бесплатно на{" "}
                <a className="text-accent underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                  openrouter.ai/keys
                </a>
                . Free-модели имеют лимит запросов в день — анализируйте лучшие, а не все.
              </>
            }
          >
            <Text value={s.openrouterKey} onChange={(v) => up({ openrouterKey: v })} secret placeholder="sk-or-v1-…" />
          </Field>
          <Field label="Модель" hint="openrouter/free сам выбирает доступную бесплатную модель. При ошибке пробуются запасные.">
            <select
              value={s.aiModel}
              onChange={(e) => up({ aiModel: e.target.value })}
              className="w-full h-10 rounded-lg border border-line bg-panel px-2 text-sm"
            >
              {!models.some((m) => m.id === s.aiModel) && <option value={s.aiModel}>{s.aiModel}</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Ваш профиль / резюме"
            hint="Вставьте резюме целиком: опыт, стек, языки, ожидания, что НЕ интересно. Его же ИИ использует для оценки вакансий."
          >
            <textarea
              value={s.profile}
              onChange={(e) => up({ profile: e.target.value })}
              rows={10}
              placeholder={"Frontend-разработчик, 3 года. React, TypeScript, Next.js. Английский B2.\nХочу продуктовую компанию, от $2000. Не интересны: гемблинг, 1С."}
              className="w-full rounded-lg border border-line bg-panel p-3 text-sm outline-none focus:border-accent"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" onClick={extract} disabled={extracting || !s.profile.trim()}>
              {extracting ? "ИИ читает резюме…" : "✦ Настроить поиск по резюме"}
            </Btn>
            <span className="text-xs text-muted">Заполнит ключевые слова, стоп-слова, уровень и зарплату ниже</span>
          </div>
          {extractError && <p className="text-sm text-bad">{extractError}</p>}
          {suggestion && (
            <div className="rounded-xl border border-accent bg-accent-soft/40 p-4 space-y-2 text-sm">
              <p className="font-medium">{suggestion.note || "Настройки заполнены по резюме"}</p>
              {suggestion.roles.length > 0 && (
                <p className="text-muted">Подходящие роли: {suggestion.roles.join(", ")}</p>
              )}
              <p className="text-muted">
                Поля ниже обновлены — проверьте и поправьте при желании. Модель: {suggestion.model}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Btn variant="primary" onClick={saveAndScan} disabled={saved === "saving"}>
                  Сохранить и сканировать
                </Btn>
                <Btn variant="outline" onClick={() => document.getElementById("search-card")?.scrollIntoView({ behavior: "smooth" })}>
                  Посмотреть поля
                </Btn>
              </div>
            </div>
          )}
          <Field label="Автоанализ после скана" hint="Сколько лучших новых вакансий сразу отправлять в ИИ. 0 — выключено.">
            <Num value={s.aiAutoTop} onChange={(v) => up({ aiAutoTop: v })} />
          </Field>
        </Card>

        <Card title="Что ищем" id="search-card">
          <Field label="Ключевые слова" hint="Стек, роли. По ним идёт поиск на площадках и скоринг. Enter — добавить.">
            <ChipsInput value={s.keywords} onChange={(v) => up({ keywords: v })} placeholder="react, python, devops, qa…" />
          </Field>
          <Field label="Обязательно хотя бы одно из" hint="Если ничего не совпало — сильный штраф к рейтингу. Можно оставить пустым.">
            <ChipsInput value={s.mustHave} onChange={(v) => up({ mustHave: v })} placeholder="typescript" />
          </Field>
          <Field label="Исключить, если встречается" hint="Такие вакансии вообще не попадут в базу.">
            <ChipsInput value={s.exclude} onChange={(v) => up({ exclude: v })} placeholder="php, wordpress…" />
          </Field>
          <Field label="Уровень">
            <div className="flex flex-wrap gap-2">
              {["intern", "junior", "middle", "senior", "lead"].map((l) => {
                const on = s.seniority.includes(l);
                return (
                  <button
                    key={l}
                    onClick={() => up({ seniority: on ? s.seniority.filter((x) => x !== l) : [...s.seniority, l] })}
                    className={cx(
                      "px-3 h-8 rounded-lg text-sm border capitalize",
                      on ? "bg-accent-soft border-accent text-accent" : "border-line hover:bg-raised",
                    )}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Мин. зарплата, $/мес" hint="Отсекает только вакансии с указанной зарплатой ниже.">
              <Num value={s.minSalaryUsd} onChange={(v) => up({ minSalaryUsd: v })} />
            </Field>
            <Field label="Не старше, дней" hint="0 — без ограничения">
              <Num value={s.maxAgeDays} onChange={(v) => up({ maxAgeDays: v })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.hideGeoRestricted}
              onChange={(e) => up({ hideGeoRestricted: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Скрывать вакансии, недоступные из Казахстана (только US / UK / конкретные страны)
          </label>
        </Card>

        <Card title="Площадки">
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(SOURCE_LABELS) as SourceId[]).map((id) => (
              <label
                key={id}
                className={cx(
                  "flex gap-3 p-3 rounded-lg border cursor-pointer",
                  s.sources[id] ? "border-accent bg-accent-soft/40" : "border-line hover:bg-raised",
                )}
              >
                <input
                  type="checkbox"
                  checked={s.sources[id]}
                  onChange={(e) => up({ sources: { ...s.sources, [id]: e.target.checked } })}
                  className="mt-0.5 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="text-sm font-medium block">{SOURCE_LABELS[id]}</span>
                  <span className="text-xs text-muted">{SOURCE_NOTES[id]}</span>
                </span>
              </label>
            ))}
          </div>
          <Field label="Telegram-каналы" hint="Имена публичных каналов без @. Парсится веб-превью t.me/s/<канал>.">
            <ChipsInput value={s.telegramChannels} onChange={(v) => up({ telegramChannels: v })} placeholder="remote_it_jobs" />
          </Field>
          <Field label="hh: регионы" hint="Поиск по публичным страницам сайта (без входа, с паузами). Удалёнка в выбранных странах.">
            <div className="flex flex-wrap gap-2">
              {[
                ["40", "Казахстан (hh.kz)"],
                ["113", "Россия (hh.ru)"],
                ["16", "Беларусь"],
                ["97", "Узбекистан"],
              ].map(([id, label]) => {
                const on = s.hhAreas.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => up({ hhAreas: on ? s.hhAreas.filter((x) => x !== id) : [...s.hhAreas, id] })}
                    className={cx(
                      "px-3 h-8 rounded-lg text-sm border",
                      on ? "bg-accent-soft border-accent text-accent" : "border-line hover:bg-raised",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field
            label="LinkedIn: локации"
            hint="Гостевой поиск удалённых вакансий без входа в аккаунт. Каждая локация × ключевое слово — отдельный запрос с паузой."
          >
            <ChipsInput value={s.linkedinLocations} onChange={(v) => up({ linkedinLocations: v })} placeholder="Kazakhstan, Worldwide, European Union" />
          </Field>
          <Field
            label="Сайты компаний"
            hint="Формат ats:slug — greenhouse:gitlab, lever:toptal, ashby:linear. Slug — часть адреса карьерной страницы компании (boards.greenhouse.io/gitlab, jobs.lever.co/toptal, jobs.ashbyhq.com/linear)."
          >
            <ChipsInput value={s.atsCompanies} onChange={(v) => up({ atsCompanies: v })} placeholder="ashby:linear" />
          </Field>
        </Card>

        <Card title="Обслуживание">
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" onClick={() => cleanup("stale", "Удалить новые вакансии, которые не встречались больше 30 дней?")}>
              Удалить устаревшие
            </Btn>
            <Btn variant="outline" onClick={() => cleanup("hidden", "Удалить все скрытые вакансии?")}>
              Удалить скрытые
            </Btn>
            <Btn variant="outline" className="text-bad" onClick={() => cleanup("all", "Удалить ВСЕ вакансии, включая избранное?")}>
              Очистить базу
            </Btn>
          </div>
        </Card>
      </div>

      <div className="fixed bottom-0 inset-x-0 border-t border-line bg-panel/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-end gap-3">
          {dirty && <span className="text-sm text-muted">Есть несохранённые изменения</span>}
          {saved === "done" && <span className="text-sm text-good">Сохранено ✓</span>}
          <Btn variant="primary" onClick={save} disabled={saved === "saving"}>
            {saved === "saving" ? "Сохраняю…" : "Сохранить"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Card({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-2xl border border-line bg-panel p-5 sm:p-6 space-y-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="w-full h-10 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-accent"
    />
  );
}

function Text({
  value,
  onChange,
  secret,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        type={secret && !show ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        autoComplete="off"
        className="flex-1 min-w-0 h-10 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-accent font-mono"
      />
      {secret && (
        <Btn variant="outline" type="button" onClick={() => setShow(!show)}>
          {show ? "Скрыть" : "Показать"}
        </Btn>
      )}
    </div>
  );
}
