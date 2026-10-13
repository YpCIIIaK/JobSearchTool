"use client";

import { Job } from "@/lib/types";
import { useEffect, useState } from "react";
import { IconCheck, IconExternal, IconMinus, IconPlus, IconRefresh, IconSpark } from "./icons";
import LetterPanel from "./LetterPanel";
import ResumeView from "./ResumeView";
import { Btn, cx, Segmented, timeAgo } from "./ui";

type Tab = "letter" | "resume" | "interview";
type Lang = "auto" | "ru" | "en";

/** Блок «Отклик»: письмо, резюме под вакансию и подготовка к интервью */
export default function ApplyPanel({ job, onPatch }: { job: Job; onPatch: (p: Partial<Job>) => void }) {
  const [tab, setTab] = useState<Tab>("letter");
  const tabs: { id: Tab; label: string; done: boolean }[] = [
    { id: "letter", label: "Письмо", done: !!job.letter },
    { id: "resume", label: "Резюме", done: !!job.resume },
    { id: "interview", label: "Интервью", done: !!job.interview },
  ];
  return (
    <section className="rounded-2xl border border-line overflow-hidden">
      <header className="flex items-center gap-3 px-5 pt-3 border-b border-line bg-bg/60">
        <span className="eyebrow pb-3">Отклик</span>
        <nav className="flex gap-0.5 ml-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative h-9 px-3 text-[13px] flex items-center gap-1.5 transition-colors",
                tab === t.id ? "text-fg font-medium" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
              {t.done && <span className="size-1.5 rounded-full bg-good" title="Готово" />}
              {tab === t.id && <span className="absolute left-2 right-2 bottom-0 h-[2px] bg-accent rounded-full" />}
            </button>
          ))}
        </nav>
      </header>
      {tab === "letter" && <LetterPanel job={job} onLetter={(letter) => onPatch({ letter })} />}
      {tab === "resume" && <ResumePanel job={job} onPatch={onPatch} />}
      {tab === "interview" && <InterviewPanel job={job} onPatch={onPatch} />}
    </section>
  );
}

/** Общая логика «сгенерировать через API» */
function useGenerate<T>(url: string, job: Job, onDone: (r: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [job.id]);
  const run = async (body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(url, { method: "POST", body: JSON.stringify({ id: job.id, ...body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onDone(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Intro({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="p-5 space-y-3">
      <div>
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[13px] text-muted mt-0.5 leading-snug">{text}</p>
      </div>
      {children}
    </div>
  );
}

function Busy({ text }: { text: string }) {
  return (
    <div className="p-5 space-y-2.5">
      <p className="text-[13px] text-accent flex items-center gap-1.5">
        <IconSpark size={13} className="animate-pulse" /> {text}
      </p>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-3" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
      ))}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-[13px] text-bad bg-bad-soft rounded-lg px-3 py-2 break-words">{error}</p> : null;
}

/* ───────── Резюме под вакансию ───────── */

function resumeText(r: NonNullable<Job["resume"]>): string {
  const lines = [r.name, r.headline, r.contacts.join(" · "), "", r.summary, ""];
  if (r.skills.length) lines.push(...r.skills.map((g) => `${g.group ? g.group + ": " : ""}${g.items.join(", ")}`), "");
  for (const e of r.experience) lines.push(`${e.role}${e.company ? " — " + e.company : ""}${e.period ? " (" + e.period + ")" : ""}`, ...e.bullets.map((b) => "• " + b), "");
  for (const p of r.projects) lines.push(`${p.name}${p.link ? " — " + p.link : ""}`, ...p.bullets.map((b) => "• " + b), "");
  if (r.education.length) lines.push(...r.education, "");
  if (r.languages.length) lines.push(r.languages.join(" · "));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function ResumePanel({ job, onPatch }: { job: Job; onPatch: (p: Partial<Job>) => void }) {
  const [lang, setLang] = useState<Lang>("auto");
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useGenerate<NonNullable<Job["resume"]>>("/api/resume", job, (resume) => onPatch({ resume }));
  const r = job.resume;
  const langSwitch = (
    <Segmented
      value={lang}
      onChange={setLang}
      options={[
        { value: "auto", label: "Язык вакансии" },
        { value: "ru", label: "RU" },
        { value: "en", label: "EN" },
      ]}
    />
  );

  if (busy && !r) return <Busy text="Собираю резюме под вакансию — до минуты на бесплатных моделях" />;
  if (!r)
    return (
      <Intro
        title="Резюме под эту вакансию"
        text="ИИ переставит акценты в вашем резюме: релевантный опыт и проекты наверх, навыки из вакансии — первыми. Только ваши факты, ничего не добавляет. Экспорт в PDF."
      >
        {langSwitch}
        <Btn variant="primary" onClick={() => run({ lang })} className="h-9">
          <IconSpark size={14} /> Собрать резюме
        </Btn>
        <ErrorLine error={error} />
      </Intro>
    );

  return (
    <div className="p-5 space-y-4">
      {r.changes.length > 0 && (
        <div className="rounded-xl bg-raised/60 px-4 py-3">
          <p className="eyebrow mb-1.5">Что изменено под вакансию</p>
          <ul className="space-y-1 text-[13px] text-fg-2">
            {r.changes.map((c, i) => (
              <li key={i} className="flex gap-2">
                <IconCheck size={13} className="text-good shrink-0 mt-[3px]" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={cx("rounded-xl border border-line bg-white p-6 max-h-[520px] overflow-y-auto scroll-thin", busy && "opacity-50")}>
        <ResumeView r={r} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/print/resume?job=${job.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-fg text-bg text-[13px] font-medium hover:bg-fg-2"
        >
          Скачать PDF <IconExternal size={13} />
        </a>
        <Btn
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(resumeText(r));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? (
            <>
              <IconCheck size={12} className="text-good" /> Скопировано
            </>
          ) : (
            "Копировать текстом"
          )}
        </Btn>
        <span className="num text-[11px] text-faint ml-auto">
          {r.model.split("/").pop()} · {timeAgo(r.at)}
        </span>
      </div>
      <div className="pt-3 border-t border-line flex flex-wrap items-center gap-2">
        {langSwitch}
        <Btn size="sm" onClick={() => run({ lang })} disabled={busy} className="ml-auto">
          <IconRefresh size={12} className={cx(busy && "animate-spin")} />
          {busy ? "Собираю…" : "Собрать заново"}
        </Btn>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/* ───────── Подготовка к интервью ───────── */

function InterviewPanel({ job, onPatch }: { job: Job; onPatch: (p: Partial<Job>) => void }) {
  const { busy, error, run } = useGenerate<NonNullable<Job["interview"]>>("/api/interview", job, (interview) => onPatch({ interview }));
  const p = job.interview;

  if (busy && !p) return <Busy text="Готовлю вопросы — до минуты на бесплатных моделях" />;
  if (!p)
    return (
      <Intro
        title="Подготовка к интервью"
        text="Вероятные вопросы по стеку этой вакансии, неудобные вопросы про ваши пробелы с вариантами честного ответа, поведенческие вопросы и что спросить у компании."
      >
        <Btn variant="primary" onClick={() => run()} className="h-9">
          <IconSpark size={14} /> Подготовить
        </Btn>
        <ErrorLine error={error} />
      </Intro>
    );

  return (
    <div className={cx("p-5 space-y-6", busy && "opacity-60")}>
      {p.focus && <p className="font-serif text-[17px] leading-snug text-fg">{p.focus}</p>}
      <QA title="По стеку" items={p.stack.map((x) => ({ q: x.q, a: x.hint }))} />
      {p.gaps.length > 0 && <QA title="Про ваши пробелы" tone="warn" items={p.gaps.map((x) => ({ q: x.q, a: x.how }))} />}
      {p.behavioral.length > 0 && <QA title="Поведенческие" items={p.behavioral.map((x) => ({ q: x.q, a: x.hint }))} />}
      {p.ask.length > 0 && (
        <div>
          <h4 className="eyebrow mb-2">Что спросить у компании</h4>
          <ul className="space-y-1.5">
            {p.ask.map((q, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] text-fg-2 leading-snug">
                <span className="num text-accent text-[12px] pt-px">{String(i + 1).padStart(2, "0")}</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="pt-3 border-t border-line flex items-center gap-2">
        <span className="num text-[11px] text-faint">
          {p.model.split("/").pop()} · {timeAgo(p.at)}
        </span>
        <Btn size="sm" onClick={() => run()} disabled={busy} className="ml-auto">
          <IconRefresh size={12} className={cx(busy && "animate-spin")} />
          {busy ? "Готовлю…" : "Подготовить заново"}
        </Btn>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/** Вопрос с раскрывающейся подсказкой */
function QA({ title, items, tone }: { title: string; items: { q: string; a: string }[]; tone?: "warn" }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      <h4 className={cx("eyebrow mb-2", tone === "warn" && "!text-warn")}>{title}</h4>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {items.map((x, i) => (
          <li key={i}>
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left flex gap-3 px-4 py-2.5 hover:bg-raised/50">
              {open === i ? <IconMinus size={13} className="text-muted shrink-0 mt-[3px]" /> : <IconPlus size={13} className="text-muted shrink-0 mt-[3px]" />}
              <span className="text-[13.5px] text-fg leading-snug">{x.q}</span>
            </button>
            {open === i && x.a && <p className="px-4 pb-3 pl-11 text-[13px] text-fg-2 leading-relaxed animate-fade-in">{x.a}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
