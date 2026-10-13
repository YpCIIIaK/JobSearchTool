"use client";

import { GeoFit } from "@/lib/types";
import { forwardRef, useState } from "react";
import { IconX } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} мин`;
  if (d < 86400) return `${Math.round(d / 3600)} ч`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} д`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/** Группа для разбивки списка по давности */
export function dayBucket(iso?: string): string {
  if (!iso) return "Без даты";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (diff <= 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  if (diff < 7) return "На этой неделе";
  if (diff < 14) return "Прошлая неделя";
  return "Раньше";
}

/* ───────── Кнопки ───────── */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "quiet";
  size?: "sm" | "md";
  icon?: boolean;
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { children, variant = "secondary", size = "md", icon, className, ...p },
  ref,
) {
  return (
    <button
      ref={ref}
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap select-none",
        "transition-[background,color,border-color,box-shadow,transform] duration-150 active:translate-y-px",
        "disabled:opacity-45 disabled:pointer-events-none",
        size === "sm" ? "h-7 text-[12.5px] rounded-md" : "h-8.5 text-[13px] rounded-lg",
        icon ? (size === "sm" ? "w-7" : "w-8.5") : size === "sm" ? "px-2.5" : "px-3",
        variant === "primary" &&
          "bg-fg text-bg hover:bg-fg-2 shadow-[inset_0_-1px_0_rgb(0_0_0/0.2)]",
        variant === "secondary" && "bg-panel border border-line-strong/80 text-fg-2 hover:border-faint hover:text-fg",
        variant === "ghost" && "text-fg-2 hover:bg-raised hover:text-fg",
        variant === "quiet" && "text-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
});

/* ───────── Шкала соответствия ───────── */

export function matchTone(v: number) {
  return v >= 70 ? "text-good" : v >= 45 ? "text-warn" : "text-faint";
}

export function MatchMeter({ value, ai, size = "md" }: { value: number; ai?: boolean; size?: "md" | "lg" }) {
  const filled = Math.round(value / 20); // 0..5 делений
  const tone = value >= 70 ? "bg-good" : value >= 45 ? "bg-warn" : "bg-faint";
  return (
    <div
      className="flex flex-col items-end gap-1 shrink-0"
      title={ai ? "Соответствие с учётом оценки ИИ" : "Соответствие по ключевым словам (без ИИ)"}
    >
      <div className={cx("num leading-none flex items-baseline gap-1", size === "lg" ? "text-[28px]" : "text-[17px]", matchTone(value))}>
        {value}
        {ai && <span className="text-[9px] font-semibold tracking-wider text-accent">AI</span>}
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={cx(
              "rounded-[1px]",
              size === "lg" ? "w-[9px] h-[4px]" : "w-[6px] h-[3px]",
              i < filled ? tone : "bg-line-strong/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────── Гео ───────── */

const GEO = {
  ok: { dot: "bg-good", text: "text-good", label: "Доступно из КЗ", short: "Из КЗ можно" },
  maybe: { dot: "bg-warn", text: "text-warn", label: "Гео не указано", short: "Гео неясно" },
  no: { dot: "bg-bad", text: "text-bad", label: "Ограничение по стране", short: "Не из КЗ" },
} as const;

export function GeoTag({ geo, compact }: { geo: GeoFit; compact?: boolean }) {
  const g = GEO[geo];
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap", g.text)}>
      <span className={cx("size-1.5 rounded-full", g.dot)} />
      {compact ? g.short : g.label}
    </span>
  );
}

/* ───────── Логотип компании ───────── */

const LOGO_TINTS = ["#d9cbb5", "#c9d3c0", "#c4cfd8", "#dcc4bf", "#d3c7d9", "#cfd0bb"];

export function Logo({ src, name, size = 36 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const letter = (name || "?").trim().replace(/^[^a-zа-яё0-9]+/i, "").charAt(0).toUpperCase() || "?";
  const tint = LOGO_TINTS[(name.charCodeAt(0) || 0) % LOGO_TINTS.length];
  const style = { width: size, height: size };
  if (!src || err)
    return (
      <div
        style={{ ...style, background: tint }}
        className="shrink-0 rounded-md grid place-items-center font-serif text-[#2a251d] text-[18px] leading-none"
      >
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
      style={style}
      className="shrink-0 rounded-md object-contain bg-white ring-1 ring-line p-0.5"
    />
  );
}

/* ───────── Формы ───────── */

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "mt-0.5 relative w-8 h-[18px] rounded-full shrink-0 transition-colors",
          checked ? "bg-fg" : "bg-raised ring-1 ring-inset ring-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] size-[14px] rounded-full shadow transition-transform",
            checked ? "translate-x-[16px] bg-bg" : "translate-x-[2px] bg-muted",
          )}
        />
      </button>
      <span className="text-[13px] leading-snug">
        <span className="text-fg-2 group-hover:text-fg">{label}</span>
        {hint && <span className="block text-muted text-[12px] mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cx("inline-flex p-0.5 rounded-lg bg-raised", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 h-7 px-2.5 rounded-md text-[12.5px] whitespace-nowrap transition-colors",
            value === o.value ? "bg-panel text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)] font-medium" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ввод списка тегов: Enter или запятая добавляет, Backspace удаляет последний */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  tone = "default",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: "default" | "negative";
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])));
    setText("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-1.5 rounded-lg border border-line-strong/80 bg-panel focus-within:border-fg-2 transition-colors min-h-10">
      {value.map((v) => (
        <span
          key={v}
          className={cx(
            "inline-flex items-center gap-0.5 text-[12.5px] rounded-md pl-2 pr-0.5 h-7 font-mono",
            tone === "negative" ? "bg-bad-soft text-bad line-through decoration-bad/40" : "bg-raised text-fg",
          )}
        >
          {v}
          <button
            type="button"
            aria-label={`Удалить ${v}`}
            onClick={() => onChange(value.filter((x) => x !== v))}
            className="size-6 grid place-items-center rounded text-muted hover:text-fg"
          >
            <IconX size={12} />
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
        placeholder={value.length ? "Добавить…" : placeholder}
        className="flex-1 min-w-28 bg-transparent outline-none text-[13px] px-1.5 placeholder:text-faint"
      />
    </div>
  );
}

export const inputCls =
  "w-full h-9 rounded-lg border border-line-strong/80 bg-panel px-3 text-[13px] outline-none focus:border-fg-2 transition-colors placeholder:text-faint";
