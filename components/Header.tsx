"use client";

import { ScanProgress, SOURCE_LABELS, SourceId } from "@/lib/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert, IconChevronDown, IconRefresh } from "./icons";
import { cx, timeAgo } from "./ui";

export const SCAN_EVENT = "jf:scan";

/** Запускает скан и сообщает остальному интерфейсу о прогрессе через window-событие */
export async function triggerScan() {
  await fetch("/api/scan", { method: "POST" });
  window.dispatchEvent(new CustomEvent(SCAN_EVENT, { detail: { started: true } }));
}

export default function Header() {
  const path = usePathname();
  return (
    <header className="h-13 shrink-0 border-b border-line bg-panel/80 backdrop-blur flex items-center gap-2 sm:gap-6 px-3 sm:px-5 relative z-30">
      <Link href="/" className="flex items-baseline gap-1.5 pr-1" aria-label="JobSearch — на главную">
        <span className="font-serif text-[22px] leading-none tracking-tight">JobSearch</span>
        <span className="size-1.5 rounded-full bg-accent translate-y-[-1px]" />
      </Link>
      <nav className="flex gap-0.5 text-[13px]">
        {[
          ["/", "Вакансии"],
          ["/settings", "Настройки"],
        ].map(([href, label]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                "px-2.5 h-8 grid place-items-center rounded-md transition-colors",
                active ? "text-fg bg-raised font-medium" : "text-muted hover:text-fg",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto">
        <ScanControl />
      </div>
    </header>
  );
}

function ScanControl() {
  const [p, setP] = useState<ScanProgress | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    const next: ScanProgress = await (await fetch("/api/scan")).json();
    setP(next);
    window.dispatchEvent(new CustomEvent(SCAN_EVENT, { detail: next }));
    return next;
  }, []);

  useEffect(() => {
    poll();
    const onEvt = (e: Event) => {
      if ((e as CustomEvent).detail?.started) poll();
    };
    window.addEventListener(SCAN_EVENT, onEvt);
    return () => window.removeEventListener(SCAN_EVENT, onEvt);
  }, [poll]);

  useEffect(() => {
    if (!p?.running) return;
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [p?.running, poll]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const entries = Object.entries(p?.sources ?? {});
  const done = entries.filter(([, s]) => s.state === "done" || s.state === "error").length;
  const errors = entries.filter(([, s]) => s.state === "error").length;
  const running = !!p?.running;
  const pct = running
    ? p!.analyzeTotal
      ? 70 + (p!.analyzed / p!.analyzeTotal) * 30
      : entries.length
        ? (done / entries.length) * 70
        : 5
    : 0;

  return (
    <div ref={box} className="relative flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="hidden sm:flex items-center gap-2 h-8.5 pl-3 pr-2 rounded-l-lg border border-r-0 border-line-strong/80 bg-panel text-[12.5px] text-muted hover:text-fg"
      >
        {running ? (
          <>
            <span className="relative size-2">
              <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" />
              <span className="absolute inset-0 rounded-full bg-accent" />
            </span>
            <span className="text-fg-2">{p!.phase}</span>
            <span className="num">{p!.analyzeTotal ? `${p!.analyzed}/${p!.analyzeTotal}` : `${done}/${entries.length}`}</span>
          </>
        ) : p?.finishedAt ? (
          <>
            {errors > 0 && <IconAlert size={13} className="text-warn" />}
            <span>
              Обновлено <span className="num">{timeAgo(p.finishedAt)}</span> назад
            </span>
            <span className="text-faint">·</span>
            <span className="num text-fg-2">+{p.added}</span>
          </>
        ) : (
          <span>Сводка скана</span>
        )}
        <IconChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      <button
        onClick={triggerScan}
        disabled={running}
        aria-label="Сканировать площадки"
        className="relative overflow-hidden flex items-center gap-1.5 h-8.5 px-2.5 sm:px-3 rounded-lg sm:rounded-l-none bg-fg text-bg text-[13px] font-medium hover:bg-fg-2 disabled:cursor-progress"
      >
        <IconRefresh size={14} className={cx(running && "animate-spin [animation-duration:1.4s]")} />
        <span className="hidden sm:inline">{running ? "Сканирую" : "Сканировать"}</span>
        {running && (
          <span className="absolute left-0 bottom-0 h-[2px] bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        )}
      </button>

      {open && p && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-line bg-panel shadow-[var(--shadow-pop)] p-4 animate-fade-in">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Площадки</span>
            <span className="text-[12px] text-muted">
              новых <span className="num text-fg">{p.added}</span> · повторов <span className="num">{p.updated}</span>
            </span>
          </div>
          <ul className="mt-3 space-y-px max-h-80 overflow-y-auto scroll-thin -mx-1">
            {entries.length === 0 && <li className="text-[13px] text-muted px-1">Запустите первый скан</li>}
            {entries.map(([id, s]) => (
              <li key={id} className="flex items-center gap-2.5 px-1 py-1.5 rounded-md text-[13px]" title={s.error}>
                <span
                  className={cx(
                    "size-1.5 rounded-full shrink-0",
                    s.state === "done" && "bg-good",
                    s.state === "error" && "bg-bad",
                    s.state === "running" && "bg-accent animate-pulse",
                    s.state === "pending" && "bg-line-strong",
                  )}
                />
                <span className="flex-1 truncate text-fg-2">{SOURCE_LABELS[id as SourceId] ?? id}</span>
                {s.state === "error" ? (
                  <span className="text-bad text-[12px] truncate max-w-32">{s.error}</span>
                ) : (
                  <span className="num text-muted">{s.state === "done" ? s.count : "…"}</span>
                )}
              </li>
            ))}
          </ul>
          {p.finishedAt && !running && (
            <p className="mt-3 pt-3 border-t border-line text-[12px] text-muted">
              Последний скан: {new Date(p.finishedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
