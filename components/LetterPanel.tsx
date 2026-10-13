"use client";

import { CoverLetter, Job } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconRefresh, IconSpark } from "./icons";
import { Btn, cx, Segmented, timeAgo } from "./ui";

type Lang = "auto" | "ru" | "en";

function CopyBtn({ text, label = "Копировать" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Btn
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? (
        <>
          <IconCheck size={12} className="text-good" /> Скопировано
        </>
      ) : (
        label
      )}
    </Btn>
  );
}

export default function LetterPanel({ job, onLetter }: { job: Job; onLetter: (l: CoverLetter) => void }) {
  const [lang, setLang] = useState<Lang>("auto");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState(job.letter?.text ?? "");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(job.letter?.text ?? "");
    setSaved(true);
    setError(null);
  }, [job.id, job.letter?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/letter", { method: "POST", body: JSON.stringify({ id: job.id, lang, note: note.trim() || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onLetter(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Автосохранение ручных правок
  const onEdit = (v: string) => {
    setText(v);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ letterText: v }) });
      setSaved(true);
    }, 700);
  };

  const letter = job.letter;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // Места, где ИИ не нашёл факта в резюме и просит заполнить вручную
  const todoRe = /\[уточнить[^\]]*\]/gi;
  const todos =
    (text.match(todoRe) ?? []).length + (letter?.answers ?? []).reduce((n, x) => n + (x.a.match(todoRe) ?? []).length, 0);

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        value={lang}
        onChange={setLang}
        options={[
          { value: "auto", label: "Язык вакансии" },
          { value: "ru", label: "RU" },
          { value: "en", label: "EN" },
        ]}
      />
      <button onClick={() => setShowNote(!showNote)} className="text-[12.5px] text-muted hover:text-fg px-1">
        {showNote ? "Без пожеланий" : "+ Пожелание"}
      </button>
    </div>
  );

  return (
    // Встраивается во вкладку «Письмо» блока «Отклик»
    <div>
      {letter && (
        <p className="num text-[11px] text-faint px-5 pt-3 -mb-2 text-right truncate">
          {letter.edited ? "изменено вами · " : ""}
          {letter.model.split("/").pop()} · {timeAgo(letter.at)}
        </p>
      )}

      {!letter && !busy ? (
        <div className="p-5 space-y-3">
          <div>
            <p className="text-[14px] font-medium">Сопроводительное письмо и ответы для формы</p>
            <p className="text-[13px] text-muted mt-0.5 leading-snug">
              ИИ напишет письмо под эту вакансию только по фактам из вашего резюме и подготовит ответы на типовые вопросы:
              почему вы, зарплата, сроки, часовой пояс.
            </p>
          </div>
          {controls}
          {showNote && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: короче, упомяни проект Repo Janitor"
              className="w-full h-9 rounded-lg border border-line-strong/80 bg-panel px-3 text-[13px] outline-none focus:border-fg-2"
            />
          )}
          <Btn variant="primary" onClick={generate} className="h-9">
            <IconSpark size={14} /> Написать письмо
          </Btn>
          {error && <p className="text-[13px] text-bad bg-bad-soft rounded-lg px-3 py-2 break-words">{error}</p>}
        </div>
      ) : busy && !letter ? (
        <div className="p-5 space-y-2.5">
          <p className="text-[13px] text-accent flex items-center gap-1.5">
            <IconSpark size={13} className="animate-pulse" /> Пишу письмо — до минуты на бесплатных моделях
          </p>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${65 + ((i * 11) % 30)}%` }} />
          ))}
        </div>
      ) : (
        letter && (
          <div className="p-5 space-y-5">
            <div>
              <textarea
                value={text}
                onChange={(e) => onEdit(e.target.value)}
                rows={Math.min(18, Math.max(8, Math.ceil(text.length / 75)))}
                className={cx(
                  "w-full rounded-xl border border-line bg-bg/40 px-4 py-3 text-[14px] leading-relaxed text-fg-2",
                  "outline-none focus:border-fg-2 focus:bg-panel transition-colors resize-y",
                  busy && "opacity-50",
                )}
                disabled={busy}
              />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="num text-[11.5px] text-faint">
                  {words} слов · {saved ? "сохранено" : "сохраняю…"}
                </span>
                {todos > 0 && (
                  <span className="text-[12px] text-warn bg-warn-soft rounded px-1.5 h-5 leading-5">
                    Заполните [уточнить…]: {todos}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <CopyBtn text={text} label="Копировать письмо" />
                </div>
              </div>
            </div>

            {letter.answers.length > 0 && (
              <div>
                <h4 className="eyebrow mb-2.5">Ответы для формы</h4>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {letter.answers.map((a, i) => (
                    <li key={i} className="px-4 py-3 group">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] text-muted">{a.q}</p>
                          <p className="text-[13.5px] text-fg mt-1 leading-snug">{a.a}</p>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <CopyBtn text={a.a} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-1 border-t border-line space-y-3">
              <div className="flex flex-wrap items-center gap-2 pt-3">
                {controls}
                <Btn size="sm" onClick={generate} disabled={busy} className="ml-auto">
                  <IconRefresh size={12} className={cx(busy && "animate-spin")} />
                  {busy ? "Пишу…" : "Написать заново"}
                </Btn>
              </div>
              {showNote && (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Например: короче, упомяни проект Repo Janitor"
                  className="w-full h-9 rounded-lg border border-line-strong/80 bg-panel px-3 text-[13px] outline-none focus:border-fg-2"
                />
              )}
              {letter.edited && !busy && (
                <p className="text-[12px] text-warn">«Написать заново» заменит ваши правки.</p>
              )}
              {error && <p className="text-[13px] text-bad bg-bad-soft rounded-lg px-3 py-2 break-words">{error}</p>}
            </div>
          </div>
        )
      )}
    </div>
  );
}
