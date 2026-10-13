"use client";

import { GeoFit } from "@/lib/types";
import { useState } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} мин`;
  if (d < 86400) return `${Math.round(d / 3600)} ч`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} дн`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

export function ScoreBadge({ value, ai, size = "md" }: { value: number; ai?: boolean; size?: "md" | "lg" }) {
  const tone =
    value >= 70 ? "bg-good-soft text-good" : value >= 45 ? "bg-warn-soft text-warn" : "bg-raised text-muted";
  return (
    <span
      title={ai ? "Рейтинг с учётом ИИ-оценки" : "Эвристический рейтинг по ключевым словам"}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-semibold tabular-nums shrink-0",
        tone,
        size === "lg" ? "h-12 min-w-12 text-lg px-2" : "h-9 min-w-9 text-sm px-1.5",
      )}
    >
      {value}
      {ai && <span className="text-[9px] ml-0.5 -mt-2 opacity-80">AI</span>}
    </span>
  );
}

export function GeoBadge({ geo }: { geo: GeoFit }) {
  const map = {
    ok: ["bg-good-soft text-good", "Можно из КЗ"],
    maybe: ["bg-warn-soft text-warn", "Гео неясно"],
    no: ["bg-bad-soft text-bad", "Ограничение по стране"],
  } as const;
  const [cls, label] = map[geo];
  return <span className={cx("text-[11px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap", cls)}>{label}</span>;
}

export function Logo({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false);
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  if (!src || err)
    return (
      <div className="size-10 shrink-0 rounded-lg bg-raised grid place-items-center text-muted font-semibold">
        {letter}
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setErr(true)}
      className="size-10 shrink-0 rounded-lg object-contain bg-white border border-line"
    />
  );
}

export function Btn({
  children,
  variant = "ghost",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-3 h-9 transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "outline" && "border border-line bg-panel hover:bg-raised",
        variant === "ghost" && "hover:bg-raised",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Ввод списка тегов: Enter или запятая добавляет */
export function ChipsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])));
    setText("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-line bg-panel focus-within:border-accent min-h-11">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 bg-accent-soft text-accent text-sm rounded-md pl-2 pr-1 py-0.5">
          {v}
          <button
            type="button"
            aria-label={`Удалить ${v}`}
            onClick={() => onChange(value.filter((x) => x !== v))}
            className="size-5 grid place-items-center rounded hover:bg-raised"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-32 bg-transparent outline-none text-sm px-1"
      />
    </div>
  );
}
