"use client";

import { useMemo, useState } from "react";
import { IconArrowLeft, IconX } from "./icons";
import { Btn, cx } from "./ui";

export interface CatalogModel {
  id: string;
  name: string;
  context: number;
  free: boolean;
  price?: string;
}

/**
 * Список моделей по приоритету: первая — основная, остальные — запасные.
 * Слаг вводится свободно; каталог только подсказывает.
 */
export default function ModelList({
  value,
  onChange,
  catalog = [],
  placeholder = "anthropic/claude-haiku-5-5",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  catalog?: CatalogModel[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog]);

  const add = (raw: string) => {
    const slugs = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length) onChange(Array.from(new Set([...value, ...slugs])));
    setText("");
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  // Подсказки: совпадения по вводу, без уже добавленных
  const q = text.trim().toLowerCase();
  const suggestions = q
    ? catalog
        .filter((m) => !value.includes(m.id) && (!onlyFree || m.free) && (m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)))
        .slice(0, 8)
    : [];
  const unknown = q && !catalog.some((m) => m.id === text.trim()) && catalog.length > 0;

  return (
    <div className="rounded-xl border border-line-strong/80 bg-panel overflow-hidden">
      {value.length > 0 && (
        <ol className="divide-y divide-line">
          {value.map((id, i) => {
            const meta = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2 group">
                <span className={cx("num text-[11px] w-16 shrink-0", i === 0 ? "text-accent" : "text-faint")}>
                  {i === 0 ? "основная" : `запас ${i}`}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-mono text-[12.5px] text-fg truncate">{id}</span>
                  {meta ? (
                    <span className="block text-[11.5px] text-muted truncate">
                      {meta.free ? <span className="text-good">бесплатно</span> : <span>{meta.price} / 1M вход.</span>}
                      {meta.context ? <span className="num"> · {Math.round(meta.context / 1000)}k контекст</span> : null}
                    </span>
                  ) : (
                    catalog.length > 0 && <span className="block text-[11.5px] text-warn">нет в каталоге OpenRouter — проверьте слаг</span>
                  )}
                </span>
                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="size-6 grid place-items-center rounded text-muted hover:text-fg hover:bg-raised disabled:opacity-30"
                    aria-label="Выше"
                  >
                    <IconArrowLeft size={12} className="rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === value.length - 1}
                    className="size-6 grid place-items-center rounded text-muted hover:text-fg hover:bg-raised disabled:opacity-30"
                    aria-label="Ниже"
                  >
                    <IconArrowLeft size={12} className="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((x) => x !== id))}
                    className="size-6 grid place-items-center rounded text-muted hover:text-bad hover:bg-raised"
                    aria-label={`Удалить ${id}`}
                  >
                    <IconX size={12} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className={cx("relative p-2", value.length > 0 && "border-t border-line bg-bg/40")}>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              }
            }}
            placeholder={`Слаг модели, например ${placeholder}`}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-w-0 h-8 bg-transparent px-2 font-mono text-[12.5px] outline-none placeholder:text-faint placeholder:font-sans"
          />
          <Btn size="sm" onClick={() => add(text)} disabled={!text.trim()}>
            Добавить
          </Btn>
        </div>
        {catalog.length > 0 && (
          <label className="flex items-center gap-1.5 px-2 pt-1.5 text-[11.5px] text-muted cursor-pointer w-fit">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-[var(--color-fg)]" />
            подсказывать только бесплатные
          </label>
        )}
        {suggestions.length > 0 && (
          <ul className="mt-1.5 rounded-lg border border-line bg-panel divide-y divide-line max-h-64 overflow-y-auto scroll-thin">
            {suggestions.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => add(m.id)}
                  className="w-full text-left flex items-center gap-3 px-3 py-1.5 hover:bg-raised"
                >
                  <span className="flex-1 min-w-0 font-mono text-[12px] truncate">{m.id}</span>
                  <span className={cx("text-[11px] shrink-0", m.free ? "text-good" : "text-muted num")}>
                    {m.free ? "бесплатно" : m.price}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {unknown && suggestions.length === 0 && (
          <p className="px-2 pt-1.5 text-[11.5px] text-muted">
            Такого слага нет в каталоге — всё равно можно добавить, если провайдер его знает.
          </p>
        )}
      </div>
    </div>
  );
}
